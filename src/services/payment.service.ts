import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';

export const paymentService = {
  async getByClinic(clinicId: string, patientId?: string | null, paymentStatus?: string | null) {
    return prisma.payment.findMany({
      where: {
        clinic_id: clinicId,
        ...(patientId ? { patient_id: patientId } : {}),
        ...(paymentStatus ? { payment_status: paymentStatus } : {}),
      },
      include: {
        patient: { select: { id: true, full_name: true, dni: true } },
        appointment: {
          select: {
            id: true,
            date: true,
            time: true,
            status: true,
            treatment: { select: { id: true, name: true } },
            appointment_treatments: {
              select: {
                treatment: { select: { id: true, name: true } },
                price: true,
                observations: true,
              },
            },
          },
        },
        payment_histories: {
          orderBy: { payment_date: 'asc' },
        },
      },
      orderBy: { created_at: 'desc' },
    });
  },

  async createPayment(clinicId: string, data: {
    patient_id: string;
    appointment_id: string;
    amount: number;
    payment_method?: string;
    notes?: string;
    total_cost?: number;
  }) {
    return prisma.$transaction(async (tx) => {
      const patient = await tx.patient.findFirst({
        where: { id: data.patient_id, clinic_id: clinicId },
        select: { id: true },
      });
      if (!patient) throw new Error('Paciente no encontrado');

      const appointment = await tx.appointment.findFirst({
        where: { id: data.appointment_id, clinic_id: clinicId },
        select: { id: true, cost: true, status: true },
      });
      if (!appointment) throw new Error('Cita no encontrada');

      const totalCost = new Prisma.Decimal(data.total_cost ?? Number(appointment.cost));
      const amount = new Prisma.Decimal(data.amount);
      const balance = Prisma.Decimal.max(new Prisma.Decimal(0), totalCost.minus(amount));
      const paymentStatus = balance.gt(0) ? 'partial' : 'completed';

      const payment = await tx.payment.create({
        data: {
          clinic_id: clinicId,
          patient_id: data.patient_id,
          appointment_id: data.appointment_id,
          amount,
          total_cost: totalCost,
          total_paid: amount,
          balance,
          payment_status: paymentStatus,
          payment_method: data.payment_method,
          notes: data.notes,
        },
      });

      await tx.paymentHistory.create({
        data: {
          clinic_id: clinicId,
          payment_id: payment.id,
          amount_paid: amount,
          payment_date: new Date(),
          payment_method: data.payment_method || 'cash',
          reference: 'initial-payment',
        },
      });

      return tx.payment.findUnique({
        where: { id: payment.id },
        include: {
          patient: { select: { id: true, full_name: true, dni: true } },
          appointment: {
            select: {
              id: true,
              date: true,
              time: true,
              status: true,
              treatment: { select: { id: true, name: true } },
              appointment_treatments: {
                select: {
                  treatment: { select: { id: true, name: true } },
                  price: true,
                  observations: true,
                },
              },
            },
          },
          payment_histories: { orderBy: { payment_date: 'asc' } },
        },
      });
    });
  },

  async addPaymentHistory(clinicId: string, paymentId: string, data: {
    amount_paid: number;
    payment_method: string;
    reference?: string;
  }) {
    return prisma.$transaction(async (tx) => {
      const payment = await tx.payment.findFirst({
        where: { id: paymentId, clinic_id: clinicId },
        include: { appointment: true },
      });
      if (!payment) throw new Error('Pago no encontrado');

      const amountPaid = new Prisma.Decimal(data.amount_paid);
      const nextTotalPaid = payment.total_paid.plus(amountPaid);
      const nextBalance = Prisma.Decimal.max(new Prisma.Decimal(0), payment.total_cost.minus(nextTotalPaid));
      const nextStatus = nextBalance.eq(0) ? 'completed' : 'partial';

      await tx.paymentHistory.create({
        data: {
          clinic_id: clinicId,
          payment_id: payment.id,
          amount_paid: amountPaid,
          payment_date: new Date(),
          payment_method: data.payment_method,
          reference: data.reference,
        },
      });

      await tx.payment.update({
        where: { id: payment.id },
        data: {
          total_paid: nextTotalPaid,
          balance: nextBalance,
          payment_status: nextStatus,
          payment_method: data.payment_method,
        },
      });

      return tx.payment.findUnique({
        where: { id: payment.id },
        include: {
          patient: { select: { id: true, full_name: true, dni: true } },
          appointment: {
            select: {
              id: true,
              date: true,
              time: true,
              status: true,
              treatment: { select: { id: true, name: true } },
              appointment_treatments: {
                select: {
                  treatment: { select: { id: true, name: true } },
                  price: true,
                  observations: true,
                },
              },
            },
          },
          payment_histories: { orderBy: { payment_date: 'asc' } },
        },
      });
    });
  },

  async getById(clinicId: string, paymentId: string) {
    return prisma.payment.findFirst({
      where: { id: paymentId, clinic_id: clinicId },
      include: {
        patient: { select: { id: true, full_name: true, dni: true } },
        appointment: {
          select: {
            id: true,
            date: true,
            time: true,
            status: true,
            treatment: { select: { id: true, name: true } },
            appointment_treatments: {
              select: {
                treatment: { select: { id: true, name: true } },
                price: true,
                observations: true,
              },
            },
          },
        },
        payment_histories: { orderBy: { payment_date: 'asc' } },
      },
    });
  },
};
