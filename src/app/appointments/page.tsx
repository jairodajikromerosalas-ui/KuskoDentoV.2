"use client";

import { useEffect, useMemo, useState } from 'react';
import { AuthProvider, useAuth } from '@/hooks/use-auth';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Plus, Calendar as CalendarIcon, Clock, Search, Trash2, ShieldAlert, Edit2, Loader2, CheckCircle2, Activity } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { Switch } from '@/components/ui/switch';
import { useFocus } from '@/hooks/use-focus';
import { format, isToday, isWithinInterval, addDays, parseISO } from 'date-fns';

function formatTime12h(timeStr: string) {
  if (!timeStr) return '';
  const parts = timeStr.split(':');
  if (parts.length < 2) return timeStr;
  const [h, m] = parts;
  let hours = parseInt(h, 10);
  const suffix = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12 || 12;
  return `${hours}:${m} ${suffix}`;
}

type ApiPatient = {
  id: string;
  dni: string;
  full_name: string;
};

type ApiTreatment = {
  id: string;
  name: string;
  price: string | number;
};

type ApiStaffMember = {
  id: string;
  fullName?: string;
  username?: string;
  role: string;
  colegiatura?: string;
};

type ApiAppointment = {
  id: string;
  patient_id: string;
  doctor_id: string;
  treatment_id?: string | null;
  date: string;
  time: string;
  cost: string | number;
  status: string;
  observations?: string | null;
  patient?: { id: string; full_name: string };
  doctor?: { id: string; full_name: string | null };
  treatment?: { id: string; name: string; price: string | number };
  appointment_treatments?: {
    treatment: { id: string; name: string; price: string | number } | null;
    price: string | number;
    observations?: string | null;
  }[];
};

type ViewAppointment = {
  id: string;
  patientId: string;
  doctorId: string;
  treatmentId?: string;
  dateIso: string;
  dateKey: string;
  time: string;
  patientName: string;
  treatmentName: string;
  doctorName: string;
  cost: number;
  status: 'Asignado' | 'Atendido';
  observations?: string;
};

async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
  });

  const body = await response.json();
  if (!response.ok) {
    throw new Error(body?.error || 'Error de API');
  }

  if (typeof body === 'object' && body !== null && 'success' in body) {
    const wrapped = body as { success?: boolean; data?: T; error?: string };
    if (!wrapped.success) {
      throw new Error(wrapped.error || 'Error de API');
    }
    return (wrapped.data as T) ?? (body as T);
  }

  return body as T;
}

function mapStatusToUi(status: string): 'Asignado' | 'Atendido' {
  return status === 'completed' || status === 'attended' ? 'Atendido' : 'Asignado';
}

function mapStatusToApi(status: 'Asignado' | 'Atendido'): 'scheduled' | 'completed' {
  return status === 'Atendido' ? 'completed' : 'scheduled';
}

function toDateKey(isoDate: string) {
  const d = parseISO(isoDate);
  return format(d, 'yyyy-MM-dd');
}

function AppointmentsContent() {
  const { toast } = useToast();
  const { user: currentUser } = useAuth();
  const [rawAppointments, setRawAppointments] = useState<ViewAppointment[]>([]);
  const [appointments, setAppointments] = useState<ViewAppointment[]>([]);
  const [patients, setPatients] = useState<ApiPatient[]>([]);
  const [treatments, setTreatments] = useState<ApiTreatment[]>([]);
  const [staffMembers, setStaffMembers] = useState<ApiStaffMember[]>([]);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [appointmentToDelete, setAppointmentToDelete] = useState<string | null>(null);
  const [confirmWord, setConfirmWord] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'today' | 'week' | 'specific'>('all');
  const [specificDate, setSpecificDate] = useState('');
  const [showAttended, setShowAttended] = useState(false);
  const { activeAppointmentId, activePatientId, focusMode, elapsedSeconds, startFocus, stopFocus, setFocusMode } = useFocus();

  const [isEditing, setIsEditing] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const doctorOptions = useMemo(() => {
    if (staffMembers.length > 0) {
      return staffMembers
        .filter((s) => s.role !== 'clinic')
        .map((s) => ({
        id: s.id,
        label: s.fullName || s.username || 'Sin nombre',
        role: s.role,
      }));
    }
    // Fallback al usuario actual si no se pudieron cargar los miembros
    return [
      {
        id: currentUser?.id || '',
        label: currentUser?.fullName || currentUser?.full_name || currentUser?.email || 'Odontologo',
        role: currentUser?.role || 'doctor',
      },
    ].filter((u) => u.role !== 'clinic');
  }, [staffMembers, currentUser]);

  const [form, setForm] = useState({
    patientId: '',
    treatmentId: '',
    doctorId: '',
    date: '',
    time: '',
    observations: '',
    status: 'Asignado' as 'Asignado' | 'Atendido',
    cost: 0,
    patientSearch: '',
    selectedTreatments: [] as { id: string; name: string; price: number }[],
  });

  const getTimeParts = () => {
    if (!form.time) return { hour: '12', minute: '00', period: 'PM' };
    const parts = form.time.split(':');
    if (parts.length < 2) return { hour: '12', minute: '00', period: 'PM' };
    const [h, m] = parts;
    let hInt = parseInt(h, 10);
    const period = hInt >= 12 ? 'PM' : 'AM';
    hInt = hInt % 12 || 12;
    return { hour: hInt.toString(), minute: m, period };
  };

  const handleTimeChange12h = (hour12: string, minute: string, period: string) => {
    let h = parseInt(hour12 || '12', 10);
    if (period === 'PM' && h < 12) h += 12;
    if (period === 'AM' && h === 12) h = 0;
    const h24 = h.toString().padStart(2, '0');
    const m = (minute || '00').padStart(2, '0');
    setForm((prev) => ({ ...prev, time: `${h24}:${m}` }));
  };

  useEffect(() => {
    if (!isOpen) {
      setIsEditing(false);
      setEditingId(null);
      setForm({
        patientId: '',
        treatmentId: '',
        doctorId: currentUser?.id || '',
        date: '',
        time: '',
        observations: '',
        status: 'Asignado',
        cost: 0,
        patientSearch: '',
        selectedTreatments: [],
      });
    }
  }, [isOpen, currentUser]);

  useEffect(() => {
    if (currentUser) {
      load();
      setForm((prev) => ({ ...prev, doctorId: currentUser.id }));
    }
  }, [currentUser?.id]);

  useEffect(() => {
    applyFilters();
  }, [rawAppointments, filterType, specificDate, showAttended, focusMode, activeAppointmentId, searchQuery]);



  const load = async () => {
    try {
      const [patientsData, treatmentsData, appointmentsData, staffData] = await Promise.all([
        apiRequest<{ items: ApiPatient[] }>('/api/patients?limit=200&view=lookup'),
        apiRequest<{ items: ApiTreatment[] }>('/api/treatments'),
        apiRequest<{ items: ApiAppointment[] }>('/api/appointments?view=calendar'),
        apiRequest<{ items: ApiStaffMember[] }>('/api/admin/users').catch(() => ({ items: [] as ApiStaffMember[] })),
      ]);

      setPatients(patientsData.items || []);
      setTreatments(treatmentsData.items || []);
      setStaffMembers(staffData.items || []);

      const mapped: ViewAppointment[] = (appointmentsData.items || []).map((a) => {
        // AJUSTE: Mapear nombres de tratamientos múltiples para que se vean en la tabla
        const namesFromMulti = a.appointment_treatments
          ?.map(at => at.treatment?.name)
          .filter(Boolean);

        const displayName = namesFromMulti && namesFromMulti.length > 0
          ? namesFromMulti.join(', ')
          : (a.treatment?.name || 'Tratamiento');

        return {
          id: a.id,
          patientId: a.patient_id,
          doctorId: a.doctor_id,
          dateIso: a.date,
          dateKey: toDateKey(a.date),
          time: a.time,
          patientName: a.patient?.full_name || 'Paciente',
          treatmentName: displayName,
          doctorName: a.doctor?.full_name || 'Doctor',
          cost: Number(a.cost) || 0,
          status: mapStatusToUi(a.status),
          observations: a.observations || '',
        };
      });

      setRawAppointments(mapped);
      setHasLoaded(true);
    } catch (error) {
      toast({ variant: 'destructive', title: 'Error al cargar agenda' });
      setHasLoaded(true);
    }
  };

  const applyFilters = () => {

    let filtered = [...rawAppointments];
    const today = new Date();
    if (filterType === 'today') filtered = filtered.filter((a) => isToday(parseISO(a.dateIso)));
    else if (filterType === 'week') {
      const nextWeek = addDays(today, 7);
      filtered = filtered.filter((a) => isWithinInterval(parseISO(a.dateIso), { start: today, end: nextWeek }));
    } else if (filterType === 'specific' && specificDate) filtered = filtered.filter((a) => a.dateKey === specificDate);

    const byStatus = showAttended
      ? filtered.filter((a) => a.status === 'Atendido')
      : filtered.filter((a) => a.status !== 'Atendido');

    let finalFiltered = byStatus;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      finalFiltered = finalFiltered.filter(a => 
        a.patientName.toLowerCase().includes(q) || 
        a.treatmentName.toLowerCase().includes(q)
      );
    }

    setAppointments(finalFiltered.sort((a, b) => a.dateKey.localeCompare(b.dateKey) || a.time.localeCompare(b.time)));
  };

  const formatDuration = (seconds: number) => {
    const min = Math.floor(seconds / 60).toString().padStart(2, '0');
    const sec = (seconds % 60).toString().padStart(2, '0');
    return `${min}:${sec}`;
  };

  const handleEditClick = (app: ViewAppointment) => {
    setIsEditing(true);
    setEditingId(app.id);
    setForm({
      patientId: app.patientId,
      treatmentId: '',
      doctorId: app.doctorId,
      date: app.dateKey,
      time: app.time,
      observations: app.observations || '',
      status: app.status,
      cost: app.cost,
      patientSearch: app.patientName,
      selectedTreatments: [],
    });
    setIsOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const method = isEditing ? 'PATCH' : 'POST';
      const url = isEditing ? `/api/appointments/${editingId}` : '/api/appointments';

      // AJUSTE: Asegurar que se envíe la lista de servicios correctamente
      await apiRequest(url, {
        method,
        body: JSON.stringify({
          patient_id: form.patientId,
          doctor_id: form.doctorId,
          date: form.date,
          time: form.time,
          cost: Math.max(0.01, form.selectedTreatments.reduce((sum, tr) => sum + tr.price, 0)),
          status: mapStatusToApi(form.status),
          observations: form.observations || undefined,
          treatment_id: form.selectedTreatments[0]?.id || null, // Referencia principal
          services: form.selectedTreatments.map((tr) => ({
            treatment_id: tr.id,
            price: tr.price,
          })),
        }),
      });

      setIsOpen(false);
      toast({ title: isEditing ? 'Cita actualizada' : 'Cita registrada' });
      load();
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Error al guardar', description: error.message });
    }
  };

  const updateStatus = async (appointmentId: string, newStatus: 'Asignado' | 'Atendido', duration_minutes?: number) => {
    try {
      await apiRequest(`/api/appointments/${appointmentId}`, {
        method: 'PATCH',
        body: JSON.stringify({ 
          status: mapStatusToApi(newStatus),
          ...(duration_minutes !== undefined ? { duration_minutes } : {})
        }),
      });
      load();
    } catch (error) { toast({ variant: 'destructive', title: 'Error al actualizar estado' }); }
  };

  const handleStartAttention = (id: string, patientId: string) => { startFocus(id, patientId); };
  const handleFinishAttention = async (id: string) => { 
    const duration = Math.ceil(elapsedSeconds / 60);
    await updateStatus(id, 'Atendido', duration); 
    stopFocus(); 
  };
  const handleDeleteRequest = (id: string) => { setAppointmentToDelete(id); setConfirmWord(''); setIsDeleteOpen(true); };

  const confirmDelete = async () => {
    if (confirmWord.trim().toUpperCase() !== 'ELIMINAR') return;
    try {
      await apiRequest(`/api/appointments/${appointmentToDelete}`, { method: 'DELETE' });
      setIsDeleteOpen(false);
      load();
      toast({ title: 'Cita eliminada' });
    } catch (error) { toast({ variant: 'destructive', title: 'Error al eliminar' }); }
  };

  const filteredPatientList = patients.filter(p => p.full_name.toLowerCase().includes(form.patientSearch.toLowerCase()) || p.dni.includes(form.patientSearch));
  const nextAppointmentId = useMemo(() => (appointments.length > 0 ? appointments[0].id : null), [appointments]);

  const stats = useMemo(() => {
    const todayAppts = rawAppointments.filter(a => isToday(parseISO(a.dateIso)));
    return {
      todayTotal: todayAppts.length,
      pending: todayAppts.filter(a => a.status === 'Asignado').length,
      completedToday: todayAppts.filter(a => a.status === 'Atendido').length,
    };
  }, [rawAppointments]);

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-3xl font-black text-primary tracking-tight">Agenda de Citas</h2>
            <p className="text-muted-foreground mt-1 font-medium">Gestión de turnos y agenda clínica</p>
          </div>
          <div className="flex gap-2">
            <Dialog open={isOpen} onOpenChange={setIsOpen}>
              <DialogTrigger asChild>
                <Button className="gap-2 h-12 font-bold shadow-lg shadow-primary/20 rounded-xl"><Plus className="w-5 h-5" /> Nueva Cita</Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>{isEditing ? 'Editar Cita' : 'Programar Cita'}</DialogTitle>
                  <DialogDescription>
                    {isEditing ? 'Modifique los datos de la cita seleccionada.' : 'Complete los datos para registrar una nueva cita.'}
                  </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSave} className="grid grid-cols-2 gap-4 py-4">
                  <div className="col-span-2 space-y-2 relative">
                    <Label>Buscar Paciente</Label>
                    <div className="relative">
                      <Search className="absolute left-3 top-3 w-4 h-4 opacity-50" />
                      <Input
                        placeholder="DNI o Nombre"
                        className="pl-10 h-11"
                        value={form.patientSearch}
                        onChange={(e) => setForm({ ...form, patientSearch: e.target.value, patientId: '' })}
                      />
                    </div>
                    {form.patientSearch && form.patientId === '' && (
                      <div className="border rounded-lg max-h-48 overflow-y-auto bg-background shadow-2xl absolute w-full top-full mt-1 z-[100]">
                        {filteredPatientList.map((p) => (
                          <div key={p.id} className="p-3 cursor-pointer hover:bg-primary/10 border-b flex justify-between items-center"
                            onClick={() => setForm({ ...form, patientId: p.id, patientSearch: p.full_name })}>
                            <p className="font-bold">{p.full_name}</p>
                            <Badge variant="outline">DNI: {p.dni}</Badge>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="col-span-2 space-y-3">
                    <div className="flex items-center justify-between">
                      <Label className="text-sm font-semibold">Servicios Añadidos</Label>
                      <Select 
                        value={form.treatmentId || undefined} 
                        onValueChange={(tid) => {
                          const t = treatments.find(x => x.id === tid);
                          if (t) {
                            const updated = [...form.selectedTreatments, { id: t.id, name: t.name, price: Number(t.price) }];
                            setForm({ ...form, selectedTreatments: updated, cost: updated.reduce((s, x) => s + x.price, 0), treatmentId: '' });
                          }
                        }}
                      >
                        <SelectTrigger className="w-fit h-9 px-4 bg-primary text-primary-foreground hover:bg-primary/90 font-bold border-none rounded-xl [&>svg:last-child]:hidden shadow-sm transition-all active:scale-95">
                          <Plus className="w-4 h-4 mr-2" /> Añadir Servicio
                        </SelectTrigger>
                        <SelectContent>
                          {treatments.filter((t) => !form.selectedTreatments.some((st) => st.id === t.id)).map((t) => (
                            <SelectItem key={t.id} value={t.id}>
                              <span className="flex items-center justify-between gap-4 w-full">
                                <span>{t.name}</span>
                                <span className="text-muted-foreground text-xs ml-auto">S/. {Number(t.price).toFixed(2)}</span>
                              </span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* LISTA DE SERVICIOS SELECCIONADOS */}
                    {form.selectedTreatments.length === 0 ? (
                      <div className="rounded-lg border border-dashed border-muted-foreground/30 py-4 text-center">
                        <p className="text-xs text-muted-foreground">No se han agregado servicios aún</p>
                      </div>
                    ) : (
                      <div className="rounded-lg border bg-muted/30 divide-y overflow-hidden">
                        {form.selectedTreatments.map((st, i) => (
                          <div key={i} className="flex items-center justify-between px-4 py-2.5 transition-colors hover:bg-muted/60 group">
                            <div className="flex items-center gap-3 min-w-0">
                              <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary/10 text-primary text-[10px] font-bold shrink-0">
                                {i + 1}
                              </span>
                              <span className="text-sm font-medium truncate">{st.name}</span>
                            </div>
                            <div className="flex items-center gap-3 shrink-0">
                              <span className="text-sm font-semibold text-primary">S/.</span>
                              <Input
                                type="number"
                                step="0.01"
                                className="w-24 h-8 text-right font-semibold"
                                value={st.price}
                                onChange={(e) => {
                                  const newVal = parseFloat(e.target.value) || 0;
                                  const up = [...form.selectedTreatments];
                                  up[i] = { ...up[i], price: newVal };
                                  setForm({ ...form, selectedTreatments: up, cost: up.reduce((s, x) => s + x.price, 0) });
                                }}
                              />
                              <button
                                type="button"
                                className="opacity-0 group-hover:opacity-100 transition-opacity w-6 h-6 rounded-full flex items-center justify-center text-destructive hover:bg-destructive/10 text-xs font-bold"
                                onClick={() => {
                                  const up = form.selectedTreatments.filter((_, idx) => idx !== i);
                                  setForm({ ...form, selectedTreatments: up, cost: up.reduce((s, x) => s + x.price, 0) });
                                }}
                              >✕</button>
                            </div>
                          </div>
                        ))}
                        {/* TOTAL */}
                        <div className="flex items-center justify-between px-4 py-3 bg-primary/5">
                          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Total</span>
                          <span className="text-base font-bold text-primary">S/. {form.selectedTreatments.reduce((s, x) => s + x.price, 0).toFixed(2)}</span>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label>Médico Tratante</Label>
                    <Select onValueChange={(v) => setForm({ ...form, doctorId: v })} value={form.doctorId || undefined}>
                      <SelectTrigger className="h-11"><SelectValue placeholder="Seleccione médico..." /></SelectTrigger>
                      <SelectContent>
                        {doctorOptions.map((u) => (
                          <SelectItem key={u.id} value={u.id}>
                            <span className="flex items-center gap-2">
                              <span>{u.label}</span>
                              <span className="text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                                {u.role === 'doctor' ? 'Odontólogo' : u.role === 'assistant' ? 'Asistente' : u.role === 'clinic' ? 'Clínica' : u.role === 'technician' ? 'Técnico' : u.role}
                              </span>
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Fecha</Label>
                    <Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required />
                  </div>

                  <div className="space-y-2">
                    <Label>Hora (12h)</Label>
                    <div className="flex gap-2">
                      <Select value={getTimeParts().hour} onValueChange={(v) => handleTimeChange12h(v, getTimeParts().minute, getTimeParts().period)}>
                        <SelectTrigger className="w-[80px]"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {Array.from({ length: 12 }, (_, i) => i + 1).map((h) => (
                            <SelectItem key={h} value={h.toString()}>{h}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <span className="flex items-center font-bold">:</span>
                      <Select value={getTimeParts().minute} onValueChange={(v) => handleTimeChange12h(getTimeParts().hour, v, getTimeParts().period)}>
                        <SelectTrigger className="w-[80px]"><SelectValue /></SelectTrigger>
                        <SelectContent className="max-h-[300px]">
                          {Array.from({ length: 60 }, (_, i) => i.toString().padStart(2, '0')).map((m) => (
                            <SelectItem key={m} value={m}>{m}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Select value={getTimeParts().period} onValueChange={(v) => handleTimeChange12h(getTimeParts().hour, getTimeParts().minute, v)}>
                        <SelectTrigger className="w-[80px]"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="AM">AM</SelectItem>
                          <SelectItem value="PM">PM</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="col-span-2 space-y-2">
                    <Label>Observaciones</Label>
                    <Textarea value={form.observations} onChange={(e) => setForm({ ...form, observations: e.target.value })} />
                  </div>


                  <div className="space-y-2">
                    <Label>Estado</Label>
                    <Select onValueChange={(v: any) => setForm({ ...form, status: v })} value={form.status}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Asignado">Asignado</SelectItem>
                        <SelectItem value="Atendido">Atendido</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <DialogFooter className="col-span-full pt-4">
                    <Button type="submit" className="w-full h-12" disabled={!form.patientId || !form.doctorId}>
                      {isEditing ? 'Guardar Cambios' : 'Guardar Cita'}
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* ACTIVE APPOINTMENT BANNER */}
        {activeAppointmentId && (() => {
          const activeAppt = rawAppointments.find(a => a.id === activeAppointmentId);
          return activeAppt ? (
            <div className="rounded-2xl border-2 border-primary/30 bg-primary/5 dark:bg-primary/10 p-5 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="relative">
                  <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center">
                    <Activity className="w-6 h-6 text-primary animate-pulse" />
                  </div>
                  <span className="absolute -top-1 -right-1 w-3 h-3 bg-green-500 rounded-full border-2 border-white dark:border-slate-900 animate-pulse" />
                </div>
                <div>
                  <p className="text-sm font-bold text-primary">En atención ahora</p>
                  <p className="text-lg font-black">{activeAppt.patientName}</p>
                  <p className="text-xs text-muted-foreground">{activeAppt.treatmentName}</p>
                </div>
              </div>
              <div className="flex items-center gap-6">
                <div className="flex flex-col items-end justify-center mr-4">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-bold text-primary uppercase tracking-wider">Modo Enfoque</span>
                    <Switch checked={focusMode} onCheckedChange={setFocusMode} />
                  </div>
                  <span className="text-[10px] text-muted-foreground text-right w-32">Oculta los demás pacientes de la lista</span>
                </div>
                <div className="text-right border-l-2 pl-6 border-primary/20">
                  <p className="text-4xl font-black font-mono text-primary tabular-nums">{formatDuration(elapsedSeconds)}</p>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-widest mt-1">Tiempo transcurrido</p>
                </div>
              </div>
            </div>
          ) : null;
        })()}

        {/* MAIN TABLE CARD */}
        <Card className="border-none shadow-xl shadow-slate-200/50 dark:shadow-none rounded-2xl overflow-hidden">
          <div className="p-6 pb-0">
            {/* TABS PENDIENTES / ATENDIDAS */}
            <div className="flex items-center gap-1 mb-4 p-1 bg-muted/50 rounded-xl w-fit">
              <button type="button" onClick={() => setShowAttended(false)}
                className={cn("px-4 py-2 rounded-lg text-sm font-bold transition-all", !showAttended ? "bg-background shadow-sm text-primary" : "text-muted-foreground hover:text-foreground")}>
                <Clock className="w-3.5 h-3.5 inline mr-1.5" />Pendientes
                <Badge variant="secondary" className="ml-2 h-5 text-[10px]">{rawAppointments.filter(a => a.status !== 'Atendido').length}</Badge>
              </button>
              <button type="button" onClick={() => setShowAttended(true)}
                className={cn("px-4 py-2 rounded-lg text-sm font-bold transition-all", showAttended ? "bg-background shadow-sm text-emerald-600" : "text-muted-foreground hover:text-foreground")}>
                <CheckCircle2 className="w-3.5 h-3.5 inline mr-1.5" />Atendidas
                <Badge variant="secondary" className="ml-2 h-5 text-[10px]">{rawAppointments.filter(a => a.status === 'Atendido').length}</Badge>
              </button>
            </div>

            {/* FILTERS AND SEARCH */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => { setFilterType('all'); setSpecificDate(''); }} className={cn("rounded-lg", filterType === 'all' && 'bg-primary/10 border-primary/30 text-primary')}>Ver Todo</Button>
                <Button variant="ghost" size="sm" onClick={() => { setFilterType('today'); setSpecificDate(''); }} className={cn("rounded-lg", filterType === 'today' && 'bg-primary/10 text-primary')}><Clock className="w-3.5 h-3.5 mr-1.5" />Hoy</Button>
                <Button variant="ghost" size="sm" onClick={() => { setFilterType('week'); setSpecificDate(''); }} className={cn("rounded-lg", filterType === 'week' && 'bg-primary/10 text-primary')}><CalendarIcon className="w-3.5 h-3.5 mr-1.5" />Esta Semana</Button>
                <Input type="date" className="h-8 w-40 text-xs rounded-lg" value={specificDate} onChange={(e) => { setSpecificDate(e.target.value); setFilterType('specific'); }} />
              </div>
              
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input 
                  placeholder="Buscar paciente o servicio..." 
                  className="pl-8 h-9 w-full sm:w-[250px] rounded-lg text-sm bg-muted/30 border-none"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            {!hasLoaded ? (
              <div className="flex flex-col items-center justify-center py-20 gap-3">
                <Loader2 className="w-8 h-8 animate-spin text-primary/40" />
                <p className="text-sm text-muted-foreground">Cargando agenda...</p>
              </div>
            ) : appointments.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 gap-4">
                <div className="w-20 h-20 rounded-full bg-muted/50 flex items-center justify-center">
                  <CalendarIcon className="w-10 h-10 text-muted-foreground/30" />
                </div>
                <div className="text-center">
                  <p className="font-bold text-muted-foreground">{showAttended ? 'No hay citas atendidas' : 'No hay citas pendientes'}</p>
                  <p className="text-xs text-muted-foreground/70 mt-1">
                    {showAttended ? 'Las citas completadas aparecerán aquí' : 'Registra una nueva cita para comenzar'}
                  </p>
                </div>
              </div>
            ) : (
              <Table>
                <TableHeader className="bg-muted/30">
                  <TableRow className="border-none">
                    <TableHead className="font-bold text-xs uppercase tracking-wider">Fecha / Hora</TableHead>
                    <TableHead className="font-bold text-xs uppercase tracking-wider">Paciente</TableHead>
                    <TableHead className="font-bold text-xs uppercase tracking-wider">Tratamiento</TableHead>
                    <TableHead className="font-bold text-xs uppercase tracking-wider">Costo</TableHead>
                    <TableHead className="font-bold text-xs uppercase tracking-wider">Estado</TableHead>
                    {!showAttended && <TableHead className="font-bold text-xs uppercase tracking-wider">Tiempo</TableHead>}
                    <TableHead className="font-bold text-xs uppercase tracking-wider text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {appointments.map((a) => {
                    const isNext = a.id === nextAppointmentId;
                    const isActive = a.id === activeAppointmentId;
                    return (
                      <TableRow
                        key={a.id}
                        className={cn(
                          "transition-colors",
                          isActive && "bg-primary/5 dark:bg-primary/10 border-l-4 border-l-primary",
                          !isActive && isNext && !showAttended && "bg-blue-50/50 dark:bg-blue-950/20 border-l-4 border-l-blue-400",
                          !isActive && !isNext && "border-l-4 border-l-transparent"
                        )}
                      >
                        <TableCell>
                          <div className="font-bold flex items-center gap-1.5">
                            <Clock className="w-3.5 h-3.5 text-muted-foreground" /> {formatTime12h(a.time)}
                          </div>
                          <div className="text-[10px] text-muted-foreground mt-0.5">{format(parseISO(a.dateIso), 'dd/MM/yyyy')}</div>
                        </TableCell>
                        <TableCell>
                          <div className="font-semibold">{a.patientName}</div>
                          <div className="text-[10px] text-muted-foreground italic">Dr. {a.doctorName}</div>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {a.treatmentName.split(', ').map((name, idx) => (
                              <Badge key={idx} variant="outline" className="text-[10px] font-medium bg-muted/30">{name}</Badge>
                            ))}
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className="font-bold text-primary">S/. {a.cost.toFixed(2)}</span>
                        </TableCell>
                        <TableCell>
                          {showAttended ? (
                            <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 border-none text-[10px] font-bold">
                              <CheckCircle2 className="w-3 h-3 mr-1" /> Atendido
                            </Badge>
                          ) : isActive ? (
                            <Badge className="bg-primary/10 text-primary border-primary/20 animate-pulse text-[10px] font-bold">
                              <Activity className="w-3 h-3 mr-1" /> En atención
                            </Badge>
                          ) : isNext ? (
                            <Badge variant="outline" className="border-blue-300 text-blue-600 dark:text-blue-400 text-[10px] font-bold">
                              Siguiente
                            </Badge>
                          ) : (
                            <Badge variant="secondary" className="text-[10px] font-medium">Asignado</Badge>
                          )}
                        </TableCell>
                        {!showAttended && (
                          <TableCell className="font-mono text-xs tabular-nums">
                            {isActive ? (
                              <span className="text-primary font-bold">{formatDuration(elapsedSeconds)}</span>
                            ) : '--:--'}
                          </TableCell>
                        )}
                        <TableCell className="text-right">
                          <div className="flex justify-end items-center gap-1">
                            {!showAttended && (
                              isActive ? (
                                <Button size="sm" onClick={() => handleFinishAttention(a.id)} className="rounded-lg font-bold">Terminar</Button>
                              ) : (
                                <Button size="sm" variant="outline" className="rounded-lg" onClick={() => handleStartAttention(a.id, a.patientId)} disabled={!isNext || !!activeAppointmentId}>Iniciar</Button>
                              )
                            )}
                            <Button variant="ghost" size="icon" onClick={() => handleEditClick(a)} className="text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/30 rounded-lg">
                              <Edit2 className="w-4 h-4" />
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => handleDeleteRequest(a.id)} className="text-destructive hover:bg-red-50 dark:hover:bg-red-950/30 rounded-lg">
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </div>
        </Card>
      </div>

      <Dialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-destructive flex items-center gap-2"><ShieldAlert /> Eliminar Cita</DialogTitle>
            <DialogDescription>Escriba ELIMINAR para confirmar.</DialogDescription>
          </DialogHeader>
          <Input value={confirmWord} onChange={(e) => setConfirmWord(e.target.value)} placeholder="ELIMINAR" />
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDeleteOpen(false)}>Cancelar</Button>
            <Button variant="destructive" onClick={confirmDelete}>Eliminar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}

export default function AppointmentsPage() {
  return (<AuthProvider><AppointmentsContent /></AuthProvider>);
}