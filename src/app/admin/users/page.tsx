"use client";

import { useState } from 'react';
import { AuthProvider, useAuth } from '@/hooks/use-auth';
import { AppLayout } from '@/components/layout/AppLayout';
import { useApi } from '@/hooks/use-api';
import { useMutation } from '@/hooks/use-mutation';
import type { AdminUser, AdminUserRole, SubscriptionPayment } from '@/types/admin';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Shield, ShieldCheck, Trash2, UserPlus, Camera, MapPin, User as UserIcon, Building2, Stethoscope, Briefcase, Edit2, CreditCard, Calendar, ShieldAlert, Search, Loader2, CheckCircle2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useToast } from '@/hooks/use-toast';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { addMonths, format, parseISO, isValid } from 'date-fns';

type SaveUserPayload = {
  id?: string;
  username?: string;
  password?: string;
  fullName?: string;
  clinicName?: string;
  dni?: string;
  address?: string;
  colegiatura?: string;
  role?: AdminUserRole;
  subscriptionFee?: number;
  subscriptionStatus?: 'active' | 'suspended' | 'blocked';
  nextPaymentDate?: string;
  contractStartDate?: string;
  paymentFrequency?: 'monthly' | 'yearly';
  photo?: string;
};

function UsersContent() {
  const fieldClassName = "h-12 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-inner font-bold text-slate-900 dark:text-slate-100 placeholder:text-slate-500 dark:placeholder:text-slate-400";
  const strongFieldClassName = "h-12 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-inner text-lg font-black text-slate-900 dark:text-slate-100 placeholder:text-slate-500 dark:placeholder:text-slate-400";
  const { toast } = useToast();
  const { user: currentUser } = useAuth();
  const {
    data: usersData,
    loading: usersLoading,
    error: usersError,
    refetch,
  } = useApi<{ items: AdminUser[] }>('/api/admin/users');

  const createUserMutation = useMutation<AdminUser, SaveUserPayload>('/api/admin/users', 'POST');
  const updateUserMutation = useMutation<AdminUser, SaveUserPayload>('/api/admin/users', 'PUT');
  const deleteUserMutation = useMutation<{ ok: true }, { id: string }>('/api/admin/users', 'DELETE');
  const registerInitialPaymentMutation = useMutation<
    SubscriptionPayment,
    { clinicId: string; amount: number; installments: number; nextPaymentDate: string; concept: string }
  >('/api/admin/subscription-payments', 'POST');

  const users = (usersData?.items ?? []).filter(u => currentUser?.role === 'admin' || u.role !== 'clinic');
  const [isOpen, setIsOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [isValidatingDni, setIsValidatingDni] = useState(false);
  const [isBillingScheduleDirty, setIsBillingScheduleDirty] = useState(false);
  const todayDate = new Date().toISOString().split('T')[0];

  const calculateNextPaymentDate = (contractStartDate: string, installmentsValue: string) => {
    if (!contractStartDate) return '';
    const start = parseISO(contractStartDate);
    if (!isValid(start)) return '';
    const installments = parseInt(installmentsValue) || 1;
    return format(addMonths(start, installments), 'yyyy-MM-dd');
  };
  
  const [form, setForm] = useState({ 
    username: '', 
    password: '', 
    fullName: '', 
    clinicName: '',
    dni: '', 
    address: '', 
    colegiatura: '',
    role: 'doctor' as AdminUserRole,
    subscriptionFee: '50',
    nextPaymentDate: calculateNextPaymentDate(todayDate, '1'),
    contractStartDate: todayDate,
    paymentFrequency: 'monthly' as 'monthly' | 'yearly',
    advanceInstallments: '1',
    subscriptionStatus: 'active' as 'active' | 'suspended' | 'blocked'
  });

  const safeFormatDate = (dateStr?: string) => {
    if (!dateStr) return '---';
    if (dateStr.includes('/')) return dateStr;
    try {
      const parsed = parseISO(dateStr);
      return isValid(parsed) ? format(parsed, 'dd/MM/yyyy') : dateStr;
    } catch (e) {
      return dateStr;
    }
  };

  const handleValidateDni = async () => {
    if (form.dni.length < 8) {
      toast({ variant: "destructive", title: "Documento Inválido", description: "El número debe tener al menos 8 dígitos." });
      return;
    }

    setIsValidatingDni(true);
    try {
      const res = await fetch(`/api/reniec?dni=${form.dni}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'Error al consultar RENIEC');
      const data = json?.data ?? json;
      const nombre = data?.nombre_completo || data?.nombres || data?.nombre || '';
      setForm(prev => ({ ...prev, fullName: nombre }));
      toast({
        title: "Identidad Validada",
        description: "Datos recuperados correctamente de RENIEC."
      });
    } catch (error: unknown) {
      toast({
        variant: "destructive",
        title: "Error al validar DNI",
        description: error instanceof Error ? error.message : "No se pudo obtener datos del DNI."
      });
    } finally {
      setIsValidatingDni(false);
    }
  };

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 2 * 1024 * 1024) {
        toast({ variant: "destructive", title: "Archivo demasiado grande", description: "El límite es 2MB." });
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => setPhotoPreview(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;

    const isAdmin = currentUser.role === 'admin';
    const normalizedDni = form.dni.replace(/\D/g, '');
    const existingDniUser = isAdmin && !editingId
      ? users.find((u) => (u.dni || '').replace(/\D/g, '') === normalizedDni)
      : null;

    if (isAdmin && !editingId && normalizedDni.length < 8) {
      toast({
        variant: 'destructive',
        title: 'DNI/RUC invalido',
        description: 'Ingrese un DNI o RUC valido para registrar el consultorio.',
      });
      return;
    }

    if (isAdmin && !editingId && existingDniUser) {
      toast({
        variant: 'destructive',
        title: 'DNI duplicado',
        description: 'El DNI ya esta registrado. Use otro DNI o edite el registro existente.',
      });
      return;
    }

    const resolvedUsername = isAdmin && !editingId
      ? (form.username.trim() || normalizedDni)
      : form.username.trim();

    const payload: SaveUserPayload = {
      username: isAdmin ? resolvedUsername : undefined,
      password: form.password.trim() || undefined,
      fullName: form.fullName || undefined,
      clinicName: isAdmin ? (form.clinicName || undefined) : undefined,
      dni: normalizedDni,
      address: form.address,
      colegiatura: form.colegiatura,
      photo: photoPreview || undefined,
      role: isAdmin ? 'clinic' : form.role,
      subscriptionFee: isAdmin ? (parseFloat(form.subscriptionFee) || 0) : undefined,
      subscriptionStatus: form.subscriptionStatus,
      nextPaymentDate: isAdmin ? form.nextPaymentDate : undefined,
      contractStartDate: isAdmin ? form.contractStartDate : undefined,
      paymentFrequency: 'monthly',
    };

    if (isAdmin && !editingId && !payload.password) {
      toast({
        variant: 'destructive',
        title: 'Clave requerida',
        description: 'Ingrese una clave para el nuevo consultorio.',
      });
      return;
    }

    if (isAdmin && !editingId && payload.password && payload.password.length < 8) {
          if (isAdmin && !editingId && !payload.clinicName) {
            toast({
              variant: 'destructive',
              title: 'Nombre de la clinica requerido',
              description: 'Ingrese el nombre de la clinica para continuar.',
            });
            return;
          }

          if (isAdmin && !editingId && !payload.username) {
            toast({
              variant: 'destructive',
              title: 'DNI/RUC requerido',
              description: 'El usuario se genera con DNI/RUC. Complete el campo.',
            });
            return;
          }
      toast({
        variant: 'destructive',
        title: 'Clave invalida',
        description: 'La clave del consultorio debe tener al menos 8 caracteres.',
      });
      return;
    }

    const saved = editingId
      ? await updateUserMutation.mutate({ ...payload, id: editingId })
      : await createUserMutation.mutate(payload);

    if (!saved) {
      const saveError = updateUserMutation.error || createUserMutation.error || '';
      const friendlyError = saveError.includes('User_dni_key') || saveError.includes('Unique constraint failed')
        ? 'El DNI ya esta registrado. Use otro DNI o edite el registro existente.'
        : saveError || 'Intente nuevamente';
      toast({
        variant: 'destructive',
        title: 'No se pudo guardar',
        description: friendlyError,
      });
      return;
    }

    if (isAdmin && !editingId) {
      const installments = parseInt(form.advanceInstallments) || 1;
      const totalAmount = (parseFloat(form.subscriptionFee) || 0) * installments;

      await registerInitialPaymentMutation.mutate({
        clinicId: saved.id,
        amount: totalAmount,
        installments,
        nextPaymentDate: form.nextPaymentDate,
        concept: `Pago inicial: ${installments} cuota(s) mensuales adelantadas`,
      });
    }

    setIsOpen(false);
    resetForm();
    toast({ title: editingId ? 'Actualizado correctamente' : 'Registrado correctamente' });
    refetch();
  };

  const resetForm = () => {
    setEditingId(null);
    setPhotoPreview(null);
    setIsBillingScheduleDirty(false);
    setForm({ 
      username: '', 
      password: '', 
      fullName: '', 
      clinicName: '',
      dni: '', 
      address: '', 
      colegiatura: '',
      role: currentUser?.role === 'clinic' ? 'doctor' : 'clinic',
      subscriptionFee: '50',
      nextPaymentDate: calculateNextPaymentDate(todayDate, '1'),
      contractStartDate: todayDate,
      paymentFrequency: 'monthly',
      advanceInstallments: '1',
      subscriptionStatus: 'active'
    });
  };

  const handleDelete = async (id: string) => {
    if (confirm('¿ELIMINAR REGISTRO? Esta acción es definitiva.')) {
      const deleted = await deleteUserMutation.mutate({ id });
      if (!deleted) {
        toast({
          variant: 'destructive',
          title: 'No se pudo eliminar',
          description: deleteUserMutation.error || 'Intente nuevamente',
        });
        return;
      }

      toast({ title: "Registro eliminado", variant: "destructive" });
      refetch();
    }
  };

  const openEdit = (u: AdminUser) => {
    const isAdmin = currentUser?.role === 'admin';
    setEditingId(u.id);
    setIsBillingScheduleDirty(false);
    setForm({ 
      username: u.username || '', 
      password: '', 
      fullName: isAdmin ? (u.ownerName || '') : (u.fullName || ''), 
      clinicName: isAdmin ? (u.fullName || '') : '',
      dni: u.dni || '', 
      address: u.address || '', 
      colegiatura: u.colegiatura || '',
      role: u.role,
      subscriptionFee: u.subscriptionFee?.toString() || '50',
      nextPaymentDate: u.nextPaymentDate || '',
      contractStartDate: u.contractStartDate || new Date().toISOString().split('T')[0],
      paymentFrequency: 'monthly',
      advanceInstallments: '1',
      subscriptionStatus: u.subscriptionStatus
    });
    setPhotoPreview(u.photo || null);
    setIsOpen(true);
  };

  if (!currentUser) return null;

  if (usersLoading) {
    return (
      <AppLayout>
        <div className="py-20 text-center text-sm font-semibold text-muted-foreground">Cargando usuarios...</div>
      </AppLayout>
    );
  }

  if (usersError) {
    return (
      <AppLayout>
        <div className="py-20 text-center text-sm font-semibold text-destructive">{usersError}</div>
      </AppLayout>
    );
  }

  const isAdmin = currentUser.role === 'admin';
  const totalInformational = (parseFloat(form.subscriptionFee) || 0) * (parseInt(form.advanceInstallments) || 1);
  const installmentOptions = Array.from({ length: 24 }, (_, i) => i + 1);

  return (
    <AppLayout>
      <div className="space-y-6 max-w-6xl mx-auto">
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-3xl font-black text-primary tracking-tight">
              {isAdmin ? 'Gestión de Red' : 'Administración de Personal'}
            </h2>
            <p className="text-muted-foreground mt-1 font-medium">
              {isAdmin 
                ? 'Control maestro de acceso y suscripciones de consultorios' 
                : 'Administra los roles y accesos de tu equipo clínico'}
            </p>
          </div>
          <Dialog open={isOpen} onOpenChange={(val) => {
            setIsOpen(val);
            if (!val) resetForm();
          }}>
            <DialogTrigger asChild>
              <Button className="gap-2 h-14 px-8 shadow-2xl shadow-primary/20 text-lg font-black rounded-2xl">
                <UserPlus className="w-6 h-6" />
                {isAdmin ? 'Nuevo Consultorio' : 'Añadir Colaborador'}
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[850px] max-h-[90vh] overflow-y-auto rounded-[2.5rem] border-none shadow-2xl">
              <DialogHeader className="p-6 pb-0">
                <DialogTitle className="text-3xl font-black flex items-center gap-4">
                  <div className="p-3 bg-primary/10 rounded-2xl text-primary">
                    {isAdmin ? <Building2 className="w-8 h-8" /> : <UserIcon className="w-8 h-8" />}
                  </div>
                  {editingId ? 'Editar Registro' : isAdmin ? 'Registrar Consultorio' : 'Añadir al Equipo'}
                </DialogTitle>
                <DialogDescription className="text-base font-bold pt-2">
                  Complete la ficha técnica oficial (Estándar regional Cusco DD/MM/AAAA)
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleSave} className="space-y-10 p-6">
                <div className="flex justify-center">
                  <div className="relative group">
                    <Avatar className="w-32 h-32 border-4 border-white dark:border-slate-800 shadow-2xl ring-4 ring-primary/10 transition-transform group-hover:scale-105">
                      <AvatarImage src={photoPreview || undefined} className="object-cover" />
                      <AvatarFallback className="bg-slate-50 text-primary text-4xl font-black">
                        {isAdmin ? <Building2 className="w-14 h-14" /> : <UserIcon className="w-14 h-14" />}
                      </AvatarFallback>
                    </Avatar>
                    <label className="absolute -bottom-2 -right-2 p-3 bg-primary rounded-2xl text-white cursor-pointer hover:bg-primary/90 transition-all shadow-xl hover:scale-110 active:scale-90 ring-4 ring-white dark:ring-slate-800">
                      <Camera className="w-6 h-6" />
                      <input type="file" accept="image/*" className="hidden" onChange={handlePhotoUpload} />
                    </label>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="space-y-3 col-span-1">
                    <Label htmlFor="dni" className="text-[10px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                      DNI / RUC del Responsable
                    </Label>
                    <div className="flex gap-3">
                      <div className="relative flex-1">
                        <Search className="absolute left-4 top-3.5 w-5 h-5 text-muted-foreground" />
                        <Input
                          id="dni"
                          value={form.dni}
                          onChange={(e) => {
                            const value = e.target.value.replace(/\D/g, '').slice(0, 11);
                            setForm((prev) => ({
                              ...prev,
                              dni: value,
                              username: isAdmin && !editingId ? value : prev.username,
                            }));
                          }}
                          maxLength={11}
                          className={cn("pl-12", fieldClassName)}
                          placeholder="45678901"
                        />
                      </div>
                      <Button 
                        type="button" 
                        onClick={handleValidateDni} 
                        disabled={isValidatingDni || form.dni.length < 8}
                        variant="secondary"
                        className="h-12 gap-2 px-6 rounded-xl font-black shadow-lg shadow-slate-200/50"
                      >
                        {isValidatingDni ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle2 className="w-5 h-5" />}
                        VALIDAR
                      </Button>
                    </div>
                  </div>

                  {isAdmin && (
                    <div className="space-y-3 col-span-1">
                      <Label htmlFor="clinicName" className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                        Nombre de la Clinica
                      </Label>
                      <Input
                        id="clinicName"
                        value={form.clinicName}
                        onChange={e => setForm({ ...form, clinicName: e.target.value })}
                        required
                        className={cn(strongFieldClassName, "text-primary dark:text-primary")}
                        placeholder="Ej: Clinica Dental Sonrisa"
                      />
                    </div>
                  )}

                  <div className="space-y-3 col-span-1">
                    <Label htmlFor="fullName" className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                      {isAdmin ? 'Nombre del Responsable' : 'Nombre Completo del Personal'}
                    </Label>
                    <Input id="fullName" value={form.fullName} onChange={e => setForm({...form, fullName: e.target.value})} className={cn(strongFieldClassName, "text-primary dark:text-primary") } placeholder={isAdmin ? 'Ej: Juan Perez' : 'Se completará automáticamente'} />
                  </div>
                  
                  {isAdmin && (
                    <>
                      <div className="space-y-3">
                        <Label htmlFor="username" className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Usuario (DNI/RUC)</Label>
                        <Input
                          id="username"
                          value={form.username}
                          onChange={e => setForm({...form, username: e.target.value})}
                          readOnly={isAdmin && !editingId}
                          className={fieldClassName}
                          placeholder="Se genera automaticamente"
                        />
                      </div>
                      <div className="space-y-3">
                        <Label htmlFor="password" className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Clave de Seguridad</Label>
                        <Input id="password" type="password" minLength={isAdmin && !editingId ? 8 : undefined} value={form.password} onChange={e => setForm({...form, password: e.target.value})} required={isAdmin && !editingId} className={fieldClassName} />
                      </div>

                      <div className="col-span-full border-t border-dashed pt-10">
                        <div className="bg-primary/5 p-8 rounded-[2rem] border border-primary/10 space-y-8">
                          <h4 className="text-lg font-black text-primary flex items-center gap-3">
                            <div className="p-2 bg-primary text-white rounded-lg"><CreditCard className="w-5 h-5" /></div> 
                            Configuración de Suscripción y Pago Inicial
                          </h4>
                          
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                            <div className="space-y-3">
                              <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Fecha de Activación</Label>
                              <div className="relative">
                                <Calendar className="absolute left-4 top-3.5 w-5 h-5 text-primary" />
                                <Input type="date" value={form.contractStartDate} onChange={e => {
                                  const contractStartDate = e.target.value;
                                  setIsBillingScheduleDirty(true);
                                  setForm({
                                    ...form,
                                    contractStartDate,
                                    nextPaymentDate: calculateNextPaymentDate(contractStartDate, form.advanceInstallments),
                                  });
                                }} className={cn("pl-12", fieldClassName)} />
                              </div>
                            </div>
                            
                            <div className="space-y-3">
                              <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Costo de Membresía (S/.)</Label>
                              <Input type="number" step="0.01" value={form.subscriptionFee} onChange={e => setForm({...form, subscriptionFee: e.target.value})} className={cn(strongFieldClassName, "text-xl")} />
                            </div>

                            <div className="space-y-3">
                              <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Cuotas Adelantadas</Label>
                              <Select value={form.advanceInstallments} onValueChange={(v: any) => {
                                const nextInstallments = String(v);
                                setIsBillingScheduleDirty(true);
                                setForm({
                                  ...form,
                                  advanceInstallments: nextInstallments,
                                  nextPaymentDate: calculateNextPaymentDate(form.contractStartDate, nextInstallments),
                                });
                              }}>
                                <SelectTrigger className="h-12 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-inner font-bold text-slate-900 dark:text-slate-100"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  {installmentOptions.map(n => (
                                    <SelectItem key={n} value={n.toString()}>{n} mes(es)</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="p-6 bg-white dark:bg-slate-900 rounded-3xl border shadow-sm flex items-center justify-between">
                              <div>
                                <p className="text-[10px] font-black uppercase text-muted-foreground tracking-widest mb-1">Primer Vencimiento Programado</p>
                                <p className="text-2xl font-black text-primary">
                                  {safeFormatDate(form.nextPaymentDate)}
                                </p>
                              </div>
                              <Calendar className="w-10 h-10 text-primary/20" />
                            </div>

                            <div className="p-6 bg-primary text-white rounded-3xl shadow-xl shadow-primary/20 flex items-center justify-between">
                              <div>
                                <p className="text-[10px] font-black uppercase opacity-80 tracking-widest mb-1">Inversión Inicial Recibida</p>
                                <p className="text-3xl font-black">S/. {totalInformational.toFixed(2)}</p>
                              </div>
                              <CheckCircle2 className="w-10 h-10 opacity-40" />
                            </div>
                          </div>

                          <div className="space-y-3">
                            <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                              <ShieldAlert className="w-4 h-4 text-amber-500" /> Estado de Acceso al Sistema
                            </Label>
                            <Select value={form.subscriptionStatus} onValueChange={(v: any) => setForm({...form, subscriptionStatus: v})}>
                              <SelectTrigger className="h-12 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-inner font-black text-slate-900 dark:text-slate-100">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="active" className="font-bold text-emerald-600">ACTIVA (Acceso Completo)</SelectItem>
                                <SelectItem value="suspended" className="font-bold text-amber-600">SUSPENDIDA (Bloqueo Preventivo)</SelectItem>
                                <SelectItem value="blocked" className="font-bold text-red-600">BLOQUEADA (Baja Definitiva)</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                      </div>
                    </>
                  )}

                  {!isAdmin && (
                    <div className="space-y-3 col-span-full">
                      <Label htmlFor="role" className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Cargo / Especialidad Clínica</Label>
                      <Select value={form.role} onValueChange={(v: any) => setForm({...form, role: v})}>
                        <SelectTrigger className="h-12 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-inner font-bold text-slate-900 dark:text-slate-100">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="doctor">Médico Odontólogo(a)</SelectItem>
                          <SelectItem value="assistant">Asistente Dental / Higienista</SelectItem>
                          <SelectItem value="technician">Técnico Dental / Laboratorista</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  
                  <div className="space-y-3">
                    <Label htmlFor="colegiatura" className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">N° de Colegiatura / Registro</Label>
                    <div className="relative">
                      <Stethoscope className="absolute left-4 top-3.5 w-5 h-5 text-muted-foreground" />
                      <Input id="colegiatura" value={form.colegiatura} onChange={e => setForm({...form, colegiatura: e.target.value})} required={!isAdmin && form.role === 'doctor'} className={cn("pl-12", fieldClassName)} placeholder="COP 12345" />
                    </div>
                  </div>

                  <div className="space-y-3 col-span-1">
                    <Label htmlFor="address" className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Ubicación / Consultorio</Label>
                    <div className="relative">
                      <MapPin className="absolute left-4 top-3.5 w-5 h-5 text-muted-foreground" />
                      <Input id="address" className={cn("pl-12", fieldClassName)} value={form.address} onChange={e => setForm({...form, address: e.target.value})} placeholder="Ej: Av. El Sol 123, Cusco" />
                    </div>
                  </div>
                </div>

                <DialogFooter className="pt-8 border-t">
                  <Button type="submit" className="w-full h-16 text-xl font-black rounded-[1.5rem] shadow-2xl shadow-primary/30 transition-transform active:scale-95">
                    {editingId ? 'ACTUALIZAR INFORMACIÓN' : 'REGISTRAR Y ACTIVAR SERVICIO'}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {users.map((u) => (
            <Card key={u.id} className="border-none shadow-xl shadow-slate-200/50 dark:shadow-none hover:shadow-2xl transition-all group overflow-hidden bg-white/80 dark:bg-slate-950/80 backdrop-blur-md rounded-[2.5rem] flex flex-col">
               <div className={cn("h-3 w-full", u.subscriptionStatus === 'active' ? 'bg-emerald-500' : u.subscriptionStatus === 'suspended' ? 'bg-amber-500' : 'bg-red-600')} />
               <CardHeader className="flex flex-row items-start gap-5 p-8 pb-4">
                 <Avatar className="w-20 h-20 rounded-3xl shadow-xl ring-4 ring-white dark:ring-slate-900">
                   <AvatarImage src={u.photo || undefined} className="object-cover" />
                   <AvatarFallback className="bg-primary/5 text-primary">
                     {u.role === 'clinic' ? <Building2 className="w-10 h-10" /> : u.role === 'doctor' ? <Stethoscope className="w-10 h-10" /> : <Briefcase className="w-10 h-10" />}
                   </AvatarFallback>
                 </Avatar>
                 <div className="flex-1 min-w-0">
                   <CardTitle className="text-xl truncate font-black text-slate-800 dark:text-white leading-tight">{u.fullName || u.username}</CardTitle>
                  {isAdmin && (
                    <p className="text-[10px] uppercase font-bold text-muted-foreground mt-1">
                      Responsable: {u.ownerName || u.username || 'Sin asignar'}
                    </p>
                  )}
                   <CardDescription className="flex items-center gap-2 mt-2 font-black text-primary uppercase text-[10px] tracking-widest bg-primary/5 w-fit px-3 py-1 rounded-full">
                     <Shield className="w-3 h-3" /> {
                       u.role === 'clinic' ? 'Consultorio' : 
                       u.role === 'doctor' ? 'Odontólogo' : 
                       u.role === 'assistant' ? 'Asistente' : 'Técnico'
                     }
                   </CardDescription>
                   {isAdmin && u.registeredByAdminId && (
                     <p className="text-[9px] font-black text-muted-foreground mt-2 flex items-center gap-1 uppercase tracking-tighter">
                       <ShieldCheck className="w-2.5 h-2.5" /> Registrado por: {u.registeredByAdminId}
                     </p>
                   )}
                 </div>
               </CardHeader>
               <CardContent className="space-y-6 p-8 flex-1">
                 {isAdmin && (
                   <div className="bg-slate-50 dark:bg-slate-900 p-6 rounded-[1.5rem] text-[11px] space-y-4 shadow-inner border border-slate-100 dark:border-slate-800">
                      <div className="flex justify-between items-center">
                        <span className="font-black text-muted-foreground uppercase tracking-widest">Estado Acceso:</span> 
                        <Badge variant={u.subscriptionStatus === 'active' ? 'default' : u.subscriptionStatus === 'suspended' ? 'secondary' : 'destructive'} className="text-[10px] h-6 font-black px-3 rounded-full">
                          {u.subscriptionStatus === 'active' ? 'ACTIVA' : u.subscriptionStatus === 'suspended' ? 'SUSPENDIDA' : 'BLOQUEADA'}
                        </Badge>
                      </div>
                      <p className="flex justify-between items-center">
                        <span className="font-black text-muted-foreground uppercase tracking-widest">Mensualidad:</span> 
                        <b className="text-primary font-black text-lg">S/. {(u.subscriptionFee || 0).toFixed(2)}</b>
                      </p>
                      <p className="flex justify-between items-center border-t border-dashed pt-3 mt-3">
                        <span className="font-black text-muted-foreground uppercase tracking-widest">Próximo Pago:</span> 
                        <b className="text-red-600 font-black text-xs bg-red-50 dark:bg-red-950/30 px-3 py-1 rounded-full">{safeFormatDate(u.nextPaymentDate)}</b>
                      </p>
                   </div>
                 )}
                 <div className="text-sm space-y-3 text-muted-foreground">
                     {isAdmin && (
                       <p className="flex items-center gap-3 font-bold">
                         <UserIcon className="w-4 h-4 text-primary" />
                         <span>Responsable: {u.ownerName || u.username || 'Sin asignar'}</span>
                       </p>
                     )}
                     {isAdmin && u.dni && (
                       <p className="flex items-center gap-3 font-bold">
                         <Shield className="w-4 h-4 text-primary" />
                         <span>DNI: {u.dni}</span>
                       </p>
                     )}
                    <p className="flex items-center gap-3 font-bold"><MapPin className="w-4 h-4 text-primary" /> <span className="truncate">{u.address || 'Ubicación no registrada'}</span></p>
                    {u.colegiatura && <p className="flex items-center gap-3 font-bold"><Stethoscope className="w-4 h-4 text-primary" /> <span>Reg: {u.colegiatura}</span></p>}
                 </div>
                 <div className="flex gap-3 pt-4">
                   <Button variant="outline" size="sm" className="gap-2 flex-1 h-12 rounded-2xl font-black hover:bg-primary/5 hover:text-primary border-2 shadow-sm transition-all" onClick={() => openEdit(u)}>
                     <Edit2 className="w-4 h-4" /> EDITAR
                   </Button>
                   <Button variant="ghost" size="icon" onClick={() => handleDelete(u.id)} className="h-12 w-12 text-destructive hover:bg-red-50 dark:hover:bg-red-950/30 rounded-2xl transition-all shadow-sm">
                     <Trash2 className="w-5 h-5" />
                   </Button>
                 </div>
               </CardContent>
            </Card>
          ))}
          {users.length === 0 && (
            <div className="col-span-full py-32 text-center opacity-30 flex flex-col items-center gap-8 border-4 border-dashed rounded-[3rem] bg-slate-50/50">
              <Building2 className="w-24 h-24 text-slate-400" />
              <div className="space-y-2">
                <p className="font-black text-2xl uppercase tracking-widest">Sin consultorios registrados</p>
                        <Input id="username" value={form.username} onChange={e => setForm({...form, username: e.target.value})} required={isAdmin && !editingId} className={fieldClassName} />
              </div>
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}

export default function UsersPage() {
  return (
    <AuthProvider>
      <UsersContent />
    </AuthProvider>
  );
}
