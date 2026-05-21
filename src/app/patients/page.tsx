"use client";

import { useEffect, useMemo, useState } from 'react';
import { AuthProvider, useAuth } from '@/hooks/use-auth';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table';
import { Card } from '@/components/ui/card';
import { UserPlus, Search, Eye, Trash2, ShieldAlert } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import Link from 'next/link';
import { useToast } from '@/hooks/use-toast';
import { useApi } from '@/hooks/use-api';
import { useFocus } from '@/hooks/use-focus';
import type { AdminUser } from '@/types/admin';


type ApiPatient = {
  id: string;
  dni: string;
  full_name: string;
};

function splitName(fullName: string) {
  const normalized = fullName.trim();
  if (!normalized) return { names: '', lastNames: '' };
  const chunks = normalized.split(/\s+/);
  if (chunks.length === 1) return { names: chunks[0], lastNames: '' };
  return {
    names: chunks.slice(0, -1).join(' '),
    lastNames: chunks[chunks.length - 1],
  };
}

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

  // Compatibilidad con respuestas planas (apiOk) y con envoltura { success, data }.
  if (typeof body === 'object' && body !== null && 'success' in body) {
    const wrapped = body as { success?: boolean; data?: T; error?: string };
    if (!wrapped.success) {
      throw new Error(wrapped.error || 'Error de API');
    }
    return (wrapped.data as T) ?? (body as T);
  }

  return body as T;
}

function PatientsContent() {
  const { toast } = useToast();
  const { user } = useAuth();
  const { focusMode, activePatientId } = useFocus();
  const { data: staffPayload } = useApi<{ items: AdminUser[] }>('/api/admin/users', {
    autoFetch: Boolean(user),
  });
  const [patients, setPatients] = useState<ApiPatient[]>([]);
  const [search, setSearch] = useState('');
  const [isRegisterOpen, setIsRegisterOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [patientToDelete, setPatientToDelete] = useState<string | null>(null);
  const [confirmWord, setConfirmWord] = useState('');

  const [newPatient, setNewPatient] = useState({
    dni: '',
    names: '',
    lastNames: '',
    email: '',
    phone: '',
    address: '',
    consultationReason: '',
    medicalObservations: '',
    attendedBy: '',
    clinical_alerts: '',
    under_treatment: false,
    prone_to_bleeding: false,
    allergic_to_meds: false,
    allergies_detail: '',
  });

  const [isValidatingDni, setIsValidatingDni] = useState(false);

  const handleValidateDni = async () => {
    if (newPatient.dni.length !== 8) {
      toast({
        variant: 'destructive',
        title: 'DNI inválido',
        description: 'El DNI debe tener 8 dígitos.',
      });
      return;
    }
    setIsValidatingDni(true);
    try {
      const res = await fetch(`/api/reniec?dni=${newPatient.dni}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'Error al consultar RENIEC');
      const data = json?.data ?? json;
      const nombres = data?.nombres || data?.nombre || '';
      const apellidoPaterno = data?.apellido_paterno || '';
      const apellidoMaterno = data?.apellido_materno || '';
      setNewPatient((prev) => ({
        ...prev,
        names: nombres,
        lastNames: `${apellidoPaterno} ${apellidoMaterno}`.trim(),
      }));
      toast({
        title: 'DNI validado',
        description: 'Datos recuperados correctamente.',
      });
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'No se pudo validar',
        description: error instanceof Error ? error.message : 'Error inesperado',
      });
    } finally {
      setIsValidatingDni(false);
    }
  };

  const staffUsers = staffPayload?.items ?? [];

  const userOptions = useMemo(() => {
    const options: { id: string; label: string }[] = [];
    const pushOption = (id?: string, label?: string | null) => {
      if (!id || options.some((item) => item.id === id)) return;
      const safeLabel = (label || '').trim();
      options.push({ id, label: safeLabel || 'Odontologo' });
    };

    staffUsers
      .filter((staff) => staff.status !== 'inactive' && staff.role !== 'clinic')
      .forEach((staff) => {
        pushOption(staff.id, staff.fullName || staff.username || staff.dni);
      });

    if (user && user.role !== 'clinic') {
      pushOption(user.id, user.fullName || user.full_name || user.email);
    }

    return options;
  }, [staffUsers, user]);

  useEffect(() => {
    if (user) {
      loadData();
    }
  }, [user]);

  const loadData = async () => {
    try {
      const data = await apiRequest<{ items: ApiPatient[]; total: number; page: number; limit: number; totalPages: number }>(
        '/api/patients?limit=200&view=summary'
      );
      setPatients(data.items || []);
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'No se pudo cargar pacientes',
        description: error instanceof Error ? error.message : 'Error inesperado',
      });
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();

    const dniFinal = newPatient.dni.trim() || '00000000';
    const fullName = `${newPatient.names} ${newPatient.lastNames}`.trim();

    try {
      await apiRequest('/api/patients', {
        method: 'POST',
        body: JSON.stringify({
          dni: dniFinal,
          full_name: fullName,
          first_name: newPatient.names || undefined,
          last_name: newPatient.lastNames || undefined,
          phone: newPatient.phone,
          address: newPatient.address,
          email: newPatient.email || undefined,
          medical_observations: [newPatient.consultationReason, newPatient.medicalObservations]
            .filter(Boolean)
            .join(' | ') || undefined,
          clinical_alerts: newPatient.clinical_alerts || undefined,
          under_treatment: newPatient.under_treatment,
          prone_to_bleeding: newPatient.prone_to_bleeding,
          allergic_to_meds: newPatient.allergic_to_meds,
          allergies_detail: newPatient.allergies_detail || undefined,
        }),
      });

      setIsRegisterOpen(false);
      resetForm();
      toast({ title: 'Paciente registrado', description: 'La historia clinica fue creada con exito.' });
      loadData();
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'No se pudo registrar',
        description: error instanceof Error ? error.message : 'Error inesperado',
      });
    }
  };

  const resetForm = () => {
    setNewPatient({
      dni: '',
      names: '',
      lastNames: '',
      email: '',
      phone: '',
      address: '',
      consultationReason: '',
      medicalObservations: '',
      attendedBy: '',
      clinical_alerts: '',
      under_treatment: false,
      prone_to_bleeding: false,
      allergic_to_meds: false,
      allergies_detail: '',
    });
  };

  const handleDeleteRequest = (id: string) => {
    setPatientToDelete(id);
    setConfirmWord('');
    setIsDeleteOpen(true);
  };

  const confirmDelete = async () => {
    if (!patientToDelete) return;

    if (confirmWord.trim().toUpperCase() !== 'ELIMINAR') {
      toast({
        variant: 'destructive',
        title: 'Confirmacion invalida',
        description: 'Escriba ELIMINAR para confirmar la eliminacion.',
      });
      return;
    }

    try {
      await apiRequest(`/api/patients/${patientToDelete}`, { method: 'DELETE' });
      setIsDeleteOpen(false);
      setPatientToDelete(null);
      toast({ title: 'Registro eliminado', variant: 'destructive' });
      loadData();
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'No se pudo eliminar',
        description: error instanceof Error ? error.message : 'Error inesperado',
      });
    }
  };

  const filteredPatients = patients.filter((p) => {
    if (focusMode && activePatientId) {
      return p.id === activePatientId;
    }
    return p.full_name.toLowerCase().includes(search.toLowerCase()) || p.dni.includes(search);
  });

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-3xl font-bold text-primary">Directorio de Pacientes</h2>
            <p className="text-muted-foreground mt-1">Gestion segura de historias clinicas digitales</p>
          </div>
          <Dialog open={isRegisterOpen} onOpenChange={setIsRegisterOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2 h-12 shadow-lg shadow-primary/20">
                <UserPlus className="w-5 h-5" />
                Nuevo Paciente
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[95vw] md:max-w-[900px] h-[90vh] overflow-y-auto rounded-3xl">
              <DialogHeader>
                <DialogTitle className="text-2xl font-bold">Registro de Paciente</DialogTitle>
                <DialogDescription>Complete la informacion basica del paciente.</DialogDescription>
              </DialogHeader>
              <form onSubmit={handleRegister} className="grid grid-cols-1 md:grid-cols-2 gap-8 py-4">
                <div className="space-y-4">
                  <h3 className="font-bold text-lg border-b pb-2 text-primary">Datos Personales</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="dni">DNI / Pasaporte</Label>
                      <div className="flex gap-2">
                        <Input
                          id="dni"
                          value={newPatient.dni}
                          onChange={(e) => setNewPatient({ ...newPatient, dni: e.target.value.replace(/\D/g, '').slice(0, 12) })}
                          placeholder="00000000"
                        />
                        <Button
                          type="button"
                          variant="secondary"
                          className="font-black"
                          disabled={isValidatingDni || newPatient.dni.length !== 8}
                          onClick={handleValidateDni}
                        >
                          {isValidatingDni ? 'Validando...' : 'VALIDAR'}
                        </Button>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="phone">Celular</Label>
                      <Input id="phone" value={newPatient.phone} onChange={(e) => setNewPatient({ ...newPatient, phone: e.target.value })} required />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="names">Nombres</Label>
                      <Input id="names" value={newPatient.names} onChange={(e) => setNewPatient({ ...newPatient, names: e.target.value })} required />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="lastNames">Apellidos</Label>
                      <Input id="lastNames" value={newPatient.lastNames} onChange={(e) => setNewPatient({ ...newPatient, lastNames: e.target.value })} required />
                    </div>
                    <div className="space-y-2 col-span-2">
                      <Label htmlFor="email">Correo (opcional)</Label>
                      <Input
                        id="email"
                        type="text"
                        inputMode="email"
                        autoComplete="email"
                        placeholder="nombre@dominio.com"
                        value={newPatient.email}
                        onChange={(e) => setNewPatient({ ...newPatient, email: e.target.value.trimStart() })}
                      />
                    </div>
                    <div className="space-y-2 col-span-2">
                      <Label htmlFor="address">Direccion</Label>
                      <Input id="address" value={newPatient.address} onChange={(e) => setNewPatient({ ...newPatient, address: e.target.value })} />
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <h3 className="font-bold text-lg border-b pb-2 text-primary">Historia Medica</h3>
                  <div className="space-y-3">
                    <div className="space-y-2">
                      <Label className="font-bold text-xs uppercase tracking-widest text-muted-foreground">Alertas de Historia Clinica</Label>
                      <Input value={newPatient.clinical_alerts} onChange={(e) => setNewPatient({ ...newPatient, clinical_alerts: e.target.value })} />
                    </div>
                    <div className="grid grid-cols-3 gap-3 mt-2">
                      <div className="space-y-2">
                        <Label className="text-xs font-black uppercase tracking-widest text-muted-foreground">T. Médico</Label>
                        <Select value={newPatient.under_treatment ? 'si' : 'no'} onValueChange={(v) => setNewPatient({ ...newPatient, under_treatment: v === 'si' })}>
                          <SelectTrigger className="h-11 rounded-xl">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="no">NO</SelectItem>
                            <SelectItem value="si">SI</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs font-black uppercase tracking-widest text-muted-foreground">Hemorragias</Label>
                        <Select value={newPatient.prone_to_bleeding ? 'si' : 'no'} onValueChange={(v) => setNewPatient({ ...newPatient, prone_to_bleeding: v === 'si' })}>
                          <SelectTrigger className="h-11 rounded-xl">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="no">NO</SelectItem>
                            <SelectItem value="si">SI</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs font-black uppercase tracking-widest text-muted-foreground">Alergias</Label>
                        <Select value={newPatient.allergic_to_meds ? 'si' : 'no'} onValueChange={(v) => setNewPatient({ ...newPatient, allergic_to_meds: v === 'si' })}>
                          <SelectTrigger className="h-11 rounded-xl">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="no">NO</SelectItem>
                            <SelectItem value="si">SI</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    {newPatient.allergic_to_meds && (
                      <div className="space-y-2 mt-3">
                        <Label className="text-xs font-black uppercase tracking-widest text-muted-foreground">Detalle alergias</Label>
                        <Input value={newPatient.allergies_detail} onChange={(e) => setNewPatient({ ...newPatient, allergies_detail: e.target.value })} />
                      </div>
                    )}
                    <div className="space-y-2">
                      <Label className="font-bold text-xs uppercase tracking-widest text-muted-foreground">Motivo de consulta</Label>
                      <Input value={newPatient.consultationReason} onChange={(e) => setNewPatient({ ...newPatient, consultationReason: e.target.value })} />
                    </div>
                    <div className="space-y-2">
                      <Label className="font-bold text-xs uppercase tracking-widest text-muted-foreground">Observaciones medicas</Label>
                      <Textarea value={newPatient.medicalObservations} onChange={(e) => setNewPatient({ ...newPatient, medicalObservations: e.target.value })} className="rounded-xl min-h-[120px]" />
                    </div>
                    <div className="space-y-2">
                      <Label className="font-bold text-xs uppercase tracking-widest text-muted-foreground">Medico tratante</Label>
                      <Select onValueChange={(v) => setNewPatient({ ...newPatient, attendedBy: v })}>
                        <SelectTrigger className="h-11 rounded-xl">
                          <SelectValue placeholder="Seleccione Odontologo" />
                        </SelectTrigger>
                        <SelectContent>
                          {userOptions.map((u) => (
                            <SelectItem key={u.id} value={u.label}>
                              {u.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>

                <DialogFooter className="col-span-full pt-6 border-t mt-4">
                  <Button type="submit" className="w-full h-14 text-lg font-black rounded-2xl shadow-xl shadow-primary/20">
                    REGISTRAR HISTORIA CLINICA
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        <Card className="p-8 border-none shadow-sm rounded-[2rem]">
          <div className="relative mb-8 max-w-2xl">
            <Search className="absolute left-4 top-3.5 h-5 w-5 text-muted-foreground" />
            <Input
              placeholder="Buscar por DNI o nombre..."
              className="pl-12 h-12 rounded-2xl bg-slate-50 dark:bg-slate-800/80 border-none shadow-inner text-base"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div className="border rounded-[1.5rem] overflow-hidden">
            <Table>
              <TableHeader className="bg-slate-50/50 dark:bg-slate-800/80">
                <TableRow>
                  <TableHead className="font-black uppercase text-[10px] tracking-widest">Documento</TableHead>
                  <TableHead className="font-black uppercase text-[10px] tracking-widest">Paciente</TableHead>
                  <TableHead className="text-right font-black uppercase text-[10px] tracking-widest">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredPatients.length > 0 ? (
                  filteredPatients.map((p) => {
                    const nameData = splitName(p.full_name);
                    return (
                      <TableRow key={p.id} className="group hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors">
                        <TableCell className="font-mono text-xs">{p.dni}</TableCell>
                        <TableCell className="font-black text-slate-800 dark:text-slate-100">
                          {nameData.lastNames ? `${nameData.names} ${nameData.lastNames}` : p.full_name}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button asChild variant="secondary" size="sm" className="gap-2 h-9 rounded-xl font-bold">
                              <Link href={`/patients/${p.id}`}>
                                <Eye className="w-4 h-4" /> Ver Historial
                              </Link>
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleDeleteRequest(p.id)}
                              className="h-9 w-9 text-destructive opacity-0 group-hover:opacity-100 transition-opacity rounded-xl hover:bg-red-50 dark:hover:bg-red-950/40"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                ) : (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center py-24 text-muted-foreground bg-slate-50/30 dark:bg-slate-800/40">
                      <UserPlus className="w-12 h-12 mx-auto mb-4 opacity-10" />
                      <p className="font-bold uppercase tracking-widest text-xs">No se encontraron registros</p>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </Card>
      </div>

      <Dialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
        <DialogContent className="sm:max-w-md rounded-[2.5rem] border-none shadow-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3 text-destructive text-xl font-black">
              <div className="p-2 bg-red-100 rounded-lg">
                <ShieldAlert className="w-6 h-6" />
              </div>
              Confirmar Eliminacion
            </DialogTitle>
            <DialogDescription className="text-base font-medium pt-2">
              Esta accion es irreversible. Escriba ELIMINAR para confirmar.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-6">
            <div className="space-y-3">
              <Label htmlFor="confirm-delete" className="text-xs font-black uppercase tracking-widest text-muted-foreground">
                Confirmacion
              </Label>
              <Input
                id="confirm-delete"
                value={confirmWord}
                onChange={(e) => setConfirmWord(e.target.value)}
                placeholder="ELIMINAR"
                className="h-12 rounded-xl bg-slate-50 dark:bg-slate-800/80 focus:bg-white dark:focus:bg-slate-700 transition-all border-none shadow-inner"
              />
            </div>
          </div>
          <DialogFooter className="gap-3">
            <Button variant="outline" onClick={() => setIsDeleteOpen(false)} className="h-12 rounded-xl font-bold flex-1">
              Cancelar
            </Button>
            <Button variant="destructive" onClick={confirmDelete} className="h-12 rounded-xl font-black flex-1 shadow-lg shadow-red-500/20">
              ELIMINAR PERMANENTE
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}

export default function PatientsPage() {
  return (
    <AuthProvider>
      <PatientsContent />
    </AuthProvider>
  );
}
