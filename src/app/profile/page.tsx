"use client";

import { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from '@/hooks/use-auth';
import { AppLayout } from '@/components/layout/AppLayout';
import { db, PaymentMethod } from '@/lib/legacy-data';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { useMutation } from '@/hooks/use-mutation';
import { Lock, ShieldCheck, User as UserIcon, QrCode, Building2, Plus, Trash2, Wallet, Palette, Sun, Moon, Laptop, Sparkles, Type, CreditCard, LogOut, Banknote, MessageCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { format, parseISO, differenceInCalendarDays } from 'date-fns';
import Link from 'next/link';


type BrandingResponse = {
  clinic: {
    id: string;
    name: string;
    domain: string;
    logo_url: string | null;
    primary_color: string | null;
    slogan: string | null;
    theme: string;
    subscription_status: 'active' | 'suspended' | 'blocked';
    next_payment_date: string | null;
  };
};

type BrandingPayload = {
  brandName?: string;
  primaryColor?: string;
  slogan?: string;
  logoUrl?: string;
  theme?: 'light' | 'dark' | 'system';
};

function ProfileContent() {
  const { user, logout, updateUser } = useAuth();
  const { toast } = useToast();
  const [passwords, setPasswords] = useState({ current: '', new: '', confirm: '' });
  const [isChanging, setIsChanging] = useState(false);
  const [isSavingAppearance, setIsSavingAppearance] = useState(false);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [isMethodOpen, setIsMethodOpen] = useState(false);
  const [isPayModalOpen, setIsPayModalOpen] = useState(false);
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethod | null>(null);
  const [selectedView, setSelectedView] = useState<'data' | 'qr'>('data');
  const { mutate: saveBranding } = useMutation<BrandingResponse, BrandingPayload>(
    '/api/clinics/me/branding',
    'PUT'
  );
  
  // States for branding
  const [primaryColor, setPrimaryColor] = useState(user?.primaryColor || '#008080');
  const [photoPreview, setPhotoPreview] = useState<string | null>(user?.photo || null);
  const [selectedTheme, setSelectedTheme] = useState<'light' | 'dark' | 'system'>(user?.theme || 'light');
  const [brandName, setBrandName] = useState(user?.brandName || '');
  const [slogan, setSlogan] = useState(user?.slogan || '');

  const [newMethod, setNewMethod] = useState<Partial<PaymentMethod>>({ type: 'bank', label: '', value: '', qrImage: '' });

  useEffect(() => {
    if (user?.role === 'admin') loadMethods();
  }, [user]);

  useEffect(() => {
    if (!user) return;
    setPrimaryColor(user.primaryColor || '#008080');
    setPhotoPreview(user.photo || null);
    setSelectedTheme(user.theme || 'light');
    setBrandName(user.brandName || '');
    setSlogan(user.slogan || '');
  }, [user?.id, user?.primaryColor, user?.photo, user?.theme, user?.brandName, user?.slogan]);

  const loadMethods = async () => {
    const all = await db.getAll<PaymentMethod>('payment_methods');
    setPaymentMethods(all);
  };

  if (!user) return null;

  const isAdmin = user.role === 'admin';
  const isClinic = ['clinic', 'clinic_owner', 'clinic_admin'].includes(user.role);

  const overdueDays = user?.nextPaymentDate
    ? Math.max(0, differenceInCalendarDays(new Date(), parseISO(user.nextPaymentDate)))
    : 0;

  const currentStatus = user ? (() => {
    if (user.subscriptionStatus === 'blocked') return 'blocked';
    if (user.subscriptionStatus === 'suspended') return 'suspended';
    if (!user.nextPaymentDate) return 'active';
    if (overdueDays > 7) return 'blocked';
    if (overdueDays > 0) return 'overdue';
    return 'active';
  })() : 'active';

  const isOverdue = currentStatus === 'overdue';
  const isBlocked = currentStatus === 'blocked';
  const isSuspended = currentStatus === 'suspended';
  const subscriptionFee = typeof user?.subscriptionFee === 'number' ? user.subscriptionFee : 50;
  const fallbackMethods: PaymentMethod[] = [
    {
      id: 'default-yape',
      type: 'qr',
      label: 'Yape',
      value: 'Numero / Cuenta\n+51 929 110 834\nTitular: Jairo Dajik Romero Salas\n\nYape QR',
      qrImage: '/files/QR.jpeg',
    },
    {
      id: 'default-bcp',
      type: 'bank',
      label: 'BCP Soles',
      value: 'Numero / Cuenta\n28503225115058\nCCI: 00228510322511505859\nTitular: William Ronaldo Cuadros Bolanos',
    },
  ];
  const displayMethods = paymentMethods.length > 0 ? paymentMethods : fallbackMethods;

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (passwords.new !== passwords.confirm) {
      toast({ variant: 'destructive', title: 'Error', description: 'Las contraseñas nuevas no coinciden.' });
      return;
    }
    setIsChanging(true);
    try {
      toast({ title: 'Pendiente de API', description: 'El cambio de contraseña se habilitará con el endpoint de perfil.' });
      setTimeout(() => logout(), 2000);
    } catch (error) {
      toast({ variant: 'destructive', title: 'Error', description: 'No se pudo actualizar la contraseña.' });
    } finally {
      setIsChanging(false);
    }
  };

  const handleSaveAppearance = async () => {
    if (!user) return;
    setIsSavingAppearance(true);
    try {
      let updatedUser = {
        ...user,
        theme: selectedTheme,
      };

      if (isClinic) {
        const response = await saveBranding({
          brandName: brandName || undefined,
          primaryColor,
          slogan: slogan || undefined,
          logoUrl: photoPreview || undefined,
          theme: selectedTheme,
        });

        if (!response?.clinic) {
          throw new Error('No se pudo guardar la personalizacion de la clinica');
        }

        const clinicTheme =
          response.clinic.theme === 'light' || response.clinic.theme === 'dark' || response.clinic.theme === 'system'
            ? response.clinic.theme
            : selectedTheme;

        updatedUser = {
          ...updatedUser,
          theme: clinicTheme,
          primaryColor: response.clinic.primary_color ?? undefined,
          photo: response.clinic.logo_url ?? undefined,
          brandName: response.clinic.name,
          slogan: response.clinic.slogan ?? undefined,
          subscriptionStatus: response.clinic.subscription_status ?? user.subscriptionStatus,
          nextPaymentDate: response.clinic.next_payment_date ?? undefined,
        };
      }

      updateUser(updatedUser);
      toast({ title: 'Identidad Visual Actualizada', description: 'Los cambios se han aplicado para tu clinica.' });
    } catch (e) {
      toast({ variant: 'destructive', title: "Error", description: "No se pudieron guardar los cambios." });
    } finally {
      setIsSavingAppearance(false);
    }
  };

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => setPhotoPreview(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  const handleAddMethod = async (e: React.FormEvent) => {
    e.preventDefault();
    const method: PaymentMethod = {
      id: crypto.randomUUID(),
      type: newMethod.type as 'qr' | 'bank',
      label: newMethod.label || '',
      value: newMethod.value || '',
      qrImage: newMethod.qrImage
    };
    await db.put('payment_methods', method);
    setIsMethodOpen(false);
    setNewMethod({ type: 'bank', label: '', value: '', qrImage: '' });
    toast({ title: "Medio de pago agregado" });
    loadMethods();
  };

  const deleteMethod = async (id: string) => {
    if (confirm("¿Eliminar este medio de pago?")) {
      await db.delete('payment_methods', id);
      loadMethods();
    }
  };

  const handleQrUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => setNewMethod(prev => ({ ...prev, qrImage: reader.result as string }));
      reader.readAsDataURL(file);
    }
  };

  const handleCopy = async (value: string) => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      toast({ title: 'Copiado', description: 'El contenido fue copiado al portapapeles.' });
    } catch {
      toast({ variant: 'destructive', title: 'Error', description: 'No se pudo copiar el contenido.' });
    }
  };

  return (
    <AppLayout setIsPayModalOpen={setIsPayModalOpen}>
      <div className="max-w-5xl mx-auto space-y-8">
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-3xl font-black text-primary tracking-tight">Configuración de Perfil</h2>
            <p className="text-muted-foreground mt-1">Personaliza tu entorno de trabajo y seguridad</p>
          </div>
          {isAdmin && <Badge className="bg-primary/10 text-primary border-primary/20 h-8 px-4 text-xs font-black uppercase tracking-widest">Master Admin</Badge>}
        </div>

        <Tabs defaultValue="security" className="space-y-6">
          <TabsList className="bg-muted p-1 rounded-2xl h-auto w-full md:w-fit flex-wrap">
            <TabsTrigger value="security" className="py-2.5 px-6 gap-2 rounded-xl data-[state=active]:shadow-lg"><Lock className="w-4 h-4" /> Seguridad</TabsTrigger>
            <TabsTrigger value="appearance" className="py-2.5 px-6 gap-2 rounded-xl data-[state=active]:shadow-lg"><Palette className="w-4 h-4" /> Identidad de Marca</TabsTrigger>
            {isClinic && (
              <TabsTrigger value="subscription" className="py-2.5 px-6 gap-2 rounded-xl data-[state=active]:shadow-lg"><CreditCard className="w-4 h-4" /> Suscripción</TabsTrigger>
            )}
            {isAdmin && <TabsTrigger value="billing" className="py-2.5 px-6 gap-2 rounded-xl data-[state=active]:shadow-lg"><Wallet className="w-4 h-4" /> Medios de Pago</TabsTrigger>}
          </TabsList>

          <TabsContent value="security" className="animate-in fade-in duration-500">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <Card className="border-none shadow-xl shadow-slate-200/50 dark:shadow-none bg-white dark:bg-slate-950 rounded-3xl">
                <CardHeader><CardTitle className="text-lg flex items-center gap-2"><ShieldCheck className="w-5 h-5 text-primary" /> Cambiar Contraseña</CardTitle></CardHeader>
                <form onSubmit={handleChangePassword}>
                  <CardContent className="space-y-4">
                    <div className="space-y-2"><Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Contraseña Actual</Label><Input type="password" value={passwords.current} onChange={e => setPasswords({...passwords, current: e.target.value})} required className="rounded-xl h-12 bg-slate-50 dark:bg-slate-900" /></div>
                    <div className="space-y-2"><Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Nueva Contraseña</Label><Input type="password" value={passwords.new} onChange={e => setPasswords({...passwords, new: e.target.value})} required className="rounded-xl h-12 bg-slate-50 dark:bg-slate-900" /></div>
                    <div className="space-y-2"><Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Confirmar Nueva Contraseña</Label><Input type="password" value={passwords.confirm} onChange={e => setPasswords({...passwords, confirm: e.target.value})} required className="rounded-xl h-12 bg-slate-50 dark:bg-slate-900" /></div>
                  </CardContent>
                  <CardFooter><Button type="submit" className="w-full h-14 text-lg font-black rounded-2xl shadow-xl shadow-primary/20" disabled={isChanging}>{isChanging ? 'Procesando...' : 'Guardar Nueva Contraseña'}</Button></CardFooter>
                </form>
              </Card>
              <Card className="border-none shadow-xl shadow-slate-200/50 dark:shadow-none bg-white dark:bg-slate-950 rounded-3xl h-fit">
                <CardHeader><CardTitle className="text-lg flex items-center gap-2"><UserIcon className="w-5 h-5 text-primary" /> Información de Usuario</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  <div className="p-6 rounded-3xl bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-800 space-y-5">
                    {isClinic ? (
                      <>
                        <div className="flex justify-between items-center"><span className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Clinica:</span><span className="text-sm font-black text-slate-900 dark:text-white">{user.brandName || 'Sin nombre'}</span></div>
                        <div className="flex justify-between items-center"><span className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Responsable:</span><span className="text-sm font-black text-slate-900 dark:text-white">{user.fullName || 'No registrado'}</span></div>
                        <div className="flex justify-between items-center"><span className="text-xs font-bold text-muted-foreground uppercase tracking-widest">DNI/RUC:</span><span className="text-sm font-black text-slate-900 dark:text-white">{user.dni || user.username || 'No registrado'}</span></div>
                        <div className="flex justify-between items-center"><span className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Acceso:</span><span className="text-sm font-black text-primary">{user.username || '-'}</span></div>
                        <div className="flex justify-between items-center"><span className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Rol:</span><Badge variant="outline" className="font-black text-[10px] uppercase">{user.role}</Badge></div>
                      </>
                    ) : (
                      <>
                        <div className="flex justify-between items-center"><span className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Titular:</span><span className="text-sm font-black text-slate-900 dark:text-white">{user.fullName}</span></div>
                        <div className="flex justify-between items-center"><span className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Acceso:</span><span className="text-sm font-black text-primary">{user.username}</span></div>
                        {user.dni && (
                          <div className="flex justify-between items-center"><span className="text-xs font-bold text-muted-foreground uppercase tracking-widest">DNI/RUC:</span><span className="text-sm font-black text-slate-900 dark:text-white">{user.dni}</span></div>
                        )}
                        <div className="flex justify-between items-center"><span className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Rol:</span><Badge variant="outline" className="font-black text-[10px] uppercase">{user.role}</Badge></div>
                      </>
                    )}
                  </div>
                  <Button onClick={logout} variant="outline" className="w-full h-12 rounded-2xl font-bold gap-2 text-destructive hover:text-destructive border-destructive/20 hover:bg-destructive/5">
                    <LogOut className="w-4 h-4" /> Cerrar Sesión
                  </Button>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="appearance" className="animate-in fade-in duration-500">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              <div className="lg:col-span-2 space-y-8">
                <Card className="border-none shadow-xl shadow-slate-200/50 dark:shadow-none bg-white dark:bg-slate-950 rounded-3xl overflow-hidden">
                  <div className="h-2 bg-primary" />
                  <CardHeader><CardTitle className="text-xl flex items-center gap-2 font-black"><Sparkles className="w-5 h-5 text-primary" /> Personalización de Marca</CardTitle></CardHeader>
                  <CardContent className="space-y-8">
                    {isClinic && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        <div className="space-y-4">
                          <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2"><Type className="w-3 h-3" /> Nombre de la Clínica</Label>
                          <Input value={brandName} onChange={e => setBrandName(e.target.value)} placeholder="Ej: Clínica Dental Smile" className="h-12 rounded-xl bg-slate-50 dark:bg-slate-900 font-bold" />
                        </div>
                        <div className="space-y-4">
                          <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2"><Sparkles className="w-3 h-3" /> Slogan / Lema</Label>
                          <Input value={slogan} onChange={e => setSlogan(e.target.value)} placeholder="Ej: Tu sonrisa, nuestra prioridad" className="h-12 rounded-xl bg-slate-50 dark:bg-slate-900 italic" />
                        </div>
                        <div className="col-span-full space-y-4">
                          <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Logo Institucional (Recomendado: Fondo transparente)</Label>
                          <div className="flex flex-col md:flex-row items-center gap-6 p-8 border-2 border-dashed rounded-3xl bg-slate-50 dark:bg-slate-900 hover:bg-slate-100 transition-colors cursor-pointer group">
                            <div className="w-48 h-24 bg-white dark:bg-white rounded-2xl shadow-inner border-2 border-slate-200 flex items-center justify-center overflow-hidden transition-transform group-hover:scale-105">
                              {photoPreview ? <img src={photoPreview} alt="Logo de la clínica" className="max-w-full max-h-full object-contain p-2" /> : <Building2 className="w-10 h-10 text-slate-200" />}
                            </div>
                            <div className="flex-1 text-center md:text-left space-y-2">
                               <p className="text-sm font-bold">Cargar nueva imagen</p>
                               <p className="text-xs text-muted-foreground">Formato PNG o JPG (Máx. 2MB). Idealmente horizontal.</p>
                               <Input type="file" accept="image/*" onChange={handlePhotoUpload} className="mt-2 h-10" />
                            </div>
                          </div>
                        </div>
                        <div className="col-span-full space-y-4">
                          <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Paleta de Color Institucional</Label>
                          <div className="flex items-center gap-8 p-6 bg-slate-50 dark:bg-slate-900 rounded-3xl border">
                            <div className="w-20 h-20 rounded-2xl shadow-2xl ring-4 ring-white dark:ring-slate-800 transition-transform hover:scale-110" style={{ backgroundColor: primaryColor }} />
                            <div className="flex-1 space-y-3">
                               <p className="text-xs font-bold">Selecciona el color que identifica a tu consultorio.</p>
                               <div className="flex gap-4">
                                  <Input type="color" value={primaryColor} onChange={(e) => setPrimaryColor(e.target.value)} className="h-12 w-24 cursor-pointer p-1 rounded-xl" />
                                  <div className="flex-1 grid grid-cols-5 gap-2">
                                     {['#008080', '#2563eb', '#7c3aed', '#db2777', '#059669'].map(c => (
                                       <button key={c} onClick={() => setPrimaryColor(c)} className="h-8 w-full rounded-lg border-2 border-white dark:border-slate-800 shadow-sm transition-all hover:scale-110" style={{ backgroundColor: c }} />
                                     ))}
                                  </div>
                               </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                    <div className="space-y-4">
                      <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Tema Visual del Sistema</Label>
                      <RadioGroup value={selectedTheme} onValueChange={(v: any) => setSelectedTheme(v)} className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <Label className={cn("flex flex-col items-center justify-between rounded-2xl border-2 border-slate-100 bg-white dark:bg-slate-900 p-6 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer transition-all", selectedTheme === 'light' && "border-primary bg-primary/5 shadow-inner")}>
                          <RadioGroupItem value="light" className="sr-only" />
                          <Sun className={cn("mb-3 h-8 w-8 text-slate-400", selectedTheme === 'light' && "text-primary")} />
                          <span className="text-[10px] font-black uppercase tracking-widest">Modo Claro</span>
                        </Label>
                        <Label className={cn("flex flex-col items-center justify-between rounded-2xl border-2 border-slate-100 bg-white dark:bg-slate-900 p-6 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer transition-all", selectedTheme === 'dark' && "border-primary bg-primary/5 shadow-inner")}>
                          <RadioGroupItem value="dark" className="sr-only" />
                          <Moon className={cn("mb-3 h-8 w-8 text-slate-400", selectedTheme === 'dark' && "text-primary")} />
                          <span className="text-[10px] font-black uppercase tracking-widest">Modo Oscuro</span>
                        </Label>
                        <Label className={cn("flex flex-col items-center justify-between rounded-2xl border-2 border-slate-100 bg-white dark:bg-slate-900 p-6 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer transition-all", selectedTheme === 'system' && "border-primary bg-primary/5 shadow-inner")}>
                          <RadioGroupItem value="system" className="sr-only" />
                          <Laptop className={cn("mb-3 h-8 w-8 text-slate-400", selectedTheme === 'system' && "text-primary")} />
                          <span className="text-[10px] font-black uppercase tracking-widest">Sistema</span>
                        </Label>
                      </RadioGroup>
                    </div>
                  </CardContent>
                  <CardFooter className="bg-slate-50 dark:bg-slate-900/50 p-6"><Button onClick={handleSaveAppearance} className="w-full h-16 text-lg font-black rounded-2xl shadow-xl shadow-primary/20 transition-transform active:scale-95" disabled={isSavingAppearance}>{isSavingAppearance ? 'Guardando Cambios...' : 'Aplicar Nueva Identidad Visual'}</Button></CardFooter>
                </Card>
              </div>

              <div className="space-y-6">
                <p className="text-xs font-black uppercase tracking-[0.2em] text-muted-foreground px-2">Vista Previa</p>
                <div className={cn("border-4 border-white dark:border-slate-800 rounded-[2.5rem] overflow-hidden shadow-2xl h-[600px] sticky top-8 transition-all", selectedTheme === 'dark' && "dark")}>
                  <div className="h-full bg-background flex flex-col">
                     <div className="h-14 border-b px-6 flex items-center justify-between" style={{ backgroundColor: primaryColor }}>
                        <div className="flex gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-white/30" /><div className="w-2.5 h-2.5 rounded-full bg-white/30" /></div>
                        {photoPreview ? <img src={photoPreview} className="h-6 object-contain brightness-0 invert" alt="logo" /> : <div className="h-3 w-20 bg-white/20 rounded" />}
                     </div>
                     <div className="flex-1 flex">
                        <div className="w-16 border-r flex flex-col items-center py-6 gap-6" style={{ backgroundColor: primaryColor + '08' }}>
                           <div className="w-8 h-8 rounded-xl shadow-sm" style={{ backgroundColor: primaryColor }} />
                           <div className="w-6 h-6 rounded bg-slate-200 dark:bg-slate-800" />
                           <div className="w-6 h-6 rounded bg-slate-200 dark:bg-slate-800" />
                        </div>
                        <div className="flex-1 p-8 space-y-6">
                           <div className="space-y-1">
                             <div className="h-2 w-12 rounded bg-primary/20" />
                             <div className="h-6 w-3/4 rounded-lg bg-slate-900 dark:bg-white" />
                           </div>
                           <div className="h-32 w-full rounded-3xl border border-dashed border-primary/20 bg-primary/5 flex items-center justify-center">
                              <Sparkles className="w-8 h-8" style={{ color: primaryColor }} />
                           </div>
                           <div className="grid grid-cols-2 gap-4">
                              <div className="h-10 rounded-xl" style={{ backgroundColor: primaryColor }} />
                              <div className="h-10 rounded-xl border-2" style={{ borderColor: primaryColor, color: primaryColor }} />
                           </div>
                        </div>
                     </div>
                  </div>
                </div>
              </div>
            </div>
          </TabsContent>

          {isClinic && (
          <TabsContent value="subscription" className="animate-in fade-in duration-500">
            <Card className="border-none shadow-xl shadow-slate-200/50 dark:shadow-none bg-white dark:bg-slate-950 rounded-3xl">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <CreditCard className="w-5 h-5 text-primary" /> Estado de Suscripción
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="p-5 bg-white dark:bg-slate-900 rounded-[1.5rem] border shadow-sm space-y-3">
                  <div className="flex justify-between items-center">
                    <p className="text-[10px] uppercase font-black text-muted-foreground tracking-widest leading-none">Status Acceso</p>
                    <Badge 
                      variant={currentStatus === 'active' ? 'default' : 'destructive'} 
                      className={cn(
                        "text-[9px] h-5 font-black px-2 uppercase tracking-tighter",
                        isOverdue && "bg-amber-500 hover:bg-amber-600",
                        currentStatus === 'active' && "bg-emerald-500 hover:bg-emerald-600"
                      )}
                    >
                      {isBlocked ? 'BLOQUEADO' : isSuspended ? 'SUSPENDIDO' : isOverdue ? 'EN MORA' : 'ACTIVO'}
                    </Badge>
                  </div>
                  <div className="space-y-2">
                    <p className="flex justify-between text-[11px] font-bold">
                      <span className="text-muted-foreground">ABONO:</span>
                      <span className="text-primary">S/. {subscriptionFee.toFixed(2)}</span>
                    </p>
                    {user.nextPaymentDate && (
                      <p className="flex justify-between text-[11px] font-bold">
                        <span className="text-muted-foreground">LÍMITE:</span>
                        <span className={cn(isOverdue ? "text-amber-600" : "text-slate-600 dark:text-slate-400")}>
                          {format(parseISO(user.nextPaymentDate), 'dd/MM/yyyy')}
                        </span>
                      </p>
                    )}
                  </div>
                </div>
                <Button 
                  variant="default" 
                  size="sm" 
                  className="w-full h-12 text-[10px] font-black gap-3 shadow-xl shadow-primary/20 rounded-2xl uppercase tracking-widest transition-transform active:scale-95" 
                  onClick={() => setIsPayModalOpen(true)}
                >
                  <Wallet className="w-4 h-4" />
                  Pagar / Renovar
                </Button>
              </CardContent>
            </Card>
          </TabsContent>
          )}

          {isAdmin && (
            <TabsContent value="billing" className="animate-in fade-in duration-500">
              <Card className="border-none shadow-xl shadow-slate-200/50 dark:shadow-none bg-white dark:bg-slate-950 rounded-3xl">
                <CardHeader className="flex flex-row items-center justify-between border-b pb-8">
                  <div><CardTitle className="text-xl font-black">Medios de Pago Centralizados</CardTitle><CardDescription>Estos datos se mostrarán en todos los paneles de consultorios.</CardDescription></div>
                  <Button onClick={() => setIsMethodOpen(true)} className="gap-2 h-12 rounded-2xl shadow-lg shadow-primary/20"><Plus className="w-5 h-5" /> Agregar Medio</Button>
                </CardHeader>
                <CardContent className="pt-8">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {paymentMethods.map(m => (
                      <Card key={m.id} className="border-none shadow-sm bg-slate-50 dark:bg-slate-900 rounded-3xl relative group hover:shadow-xl transition-all border border-transparent hover:border-primary/10">
                        <CardContent className="p-6">
                          <div className="flex items-start gap-5">
                            <div className="p-5 bg-white dark:bg-slate-800 rounded-2xl text-primary shadow-sm border border-slate-100 dark:border-slate-700 transition-transform group-hover:scale-105"><QrCode className="w-8 h-8" /></div>
                            <div className="flex-1 min-w-0">
                              <p className="font-black text-[10px] uppercase text-muted-foreground tracking-widest mb-1">{m.label}</p>
                              <p className="text-lg font-black break-all text-slate-800 dark:text-white leading-tight">{m.value}</p>
                            </div>
                          </div>
                          <Button variant="ghost" size="icon" onClick={() => deleteMethod(m.id)} className="absolute top-3 right-3 text-destructive opacity-0 group-hover:opacity-100 transition-opacity bg-white/50 dark:bg-slate-800/50 rounded-full hover:bg-red-50"><Trash2 className="w-5 h-5" /></Button>
                        </CardContent>
                      </Card>
                    ))}
                    {paymentMethods.length === 0 && (
                      <div className="col-span-full py-20 text-center border-2 border-dashed rounded-3xl bg-slate-50/50">
                        <Wallet className="w-12 h-12 mx-auto mb-4 opacity-10" />
                        <p className="text-xs font-black uppercase tracking-widest text-muted-foreground">No hay medios de pago configurados</p>
                      </div>
                    )}
                  </div>
                </CardContent>

              </Card>
            </TabsContent>
          )}
        </Tabs>
      </div>

      <Dialog open={isMethodOpen} onOpenChange={setIsMethodOpen}>
        <DialogContent className="sm:max-w-md rounded-[2.5rem] border-none shadow-2xl overflow-hidden p-0">
          <div className="bg-primary h-2" />
          <div className="p-10 space-y-6">
            <DialogHeader><DialogTitle className="text-2xl font-black flex items-center gap-3"><Plus className="text-primary w-8 h-8" /> Nuevo Medio de Pago</DialogTitle></DialogHeader>
            <form onSubmit={handleAddMethod} className="space-y-5">
              <div className="space-y-2"><Label className="text-xs font-bold uppercase tracking-widest">Tipo de Medio</Label><Select value={newMethod.type} onValueChange={v => setNewMethod({...newMethod, type: v as any})}><SelectTrigger className="h-12 rounded-2xl"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="bank">Cuenta Bancaria (Transferencia)</SelectItem><SelectItem value="qr">Código QR (Yape/Plin)</SelectItem></SelectContent></Select></div>
              <div className="space-y-2"><Label className="text-xs font-bold uppercase tracking-widest">Entidad / Banco</Label><Input value={newMethod.label} onChange={e => setNewMethod({...newMethod, label: e.target.value})} required className="h-12 rounded-2xl bg-slate-50" placeholder="Ej: BCP Soles" /></div>
              <div className="space-y-2"><Label className="text-xs font-bold uppercase tracking-widest">Número / Dato</Label><Input value={newMethod.value} onChange={e => setNewMethod({...newMethod, value: e.target.value})} required className="h-12 rounded-2xl bg-slate-50" placeholder="Ej: 191-234567-0-91" /></div>
              {newMethod.type === 'qr' && <div className="space-y-2"><Label className="text-xs font-bold uppercase tracking-widest">Imagen del Código QR</Label><div className="flex items-center gap-4 bg-slate-50 p-4 rounded-2xl border-2 border-dashed"><QrCode className="w-8 h-8 opacity-20" /><Input type="file" accept="image/*" onChange={handleQrUpload} className="h-10 border-none bg-transparent shadow-none" /></div></div>}
              <Button type="submit" className="w-full h-16 text-lg font-black rounded-2xl shadow-xl shadow-primary/20 mt-4">Guardar Configuración</Button>
            </form>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={isPayModalOpen} onOpenChange={setIsPayModalOpen}>
        <DialogContent className="sm:max-w-4xl rounded-[3.5rem] border-none shadow-[0_35px_60px_-15px_rgba(0,0,0,0.5)] max-h-[90vh] overflow-y-auto scrollbar-hide p-0">
          <div className="bg-primary h-3" />
          <div className="p-14 space-y-10">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-4 text-3xl font-black tracking-tight">
                <div className="p-3 bg-emerald-100 text-emerald-600 rounded-2xl"><Banknote className="w-8 h-8" /></div>
                Medios de Pago Autorizados
              </DialogTitle>
              <DialogDescription className="text-lg font-bold text-slate-600 dark:text-slate-400 mt-4 leading-relaxed">
                Realice su abono mensual para mantener el servicio activo. Luego de pagar, reporte su comprobante para la validación manual.
              </DialogDescription>
            </DialogHeader>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {displayMethods.map((m) => (
                <div key={m.id} className="p-8 rounded-[2.5rem] border-2 bg-slate-50 dark:bg-slate-900 flex flex-col items-center gap-6 transition-all hover:bg-white dark:hover:bg-slate-950 hover:shadow-2xl hover:border-primary/20 group">
                  <button
                    type="button"
                    className="p-5 bg-white dark:bg-slate-800 rounded-2xl text-primary border shadow-sm group-hover:scale-110 transition-transform"
                    onClick={() => {
                      setSelectedMethod(m);
                      setSelectedView('qr');
                    }}
                    aria-label="Ver QR"
                  >
                    {m.type === 'qr' ? <QrCode className="w-8 h-8" /> : <Building2 className="w-8 h-8" />}
                  </button>
                  <div className="text-center w-full space-y-3">
                    <p className="text-[11px] font-black uppercase text-muted-foreground tracking-widest leading-none">{m.label}</p>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-9 rounded-xl font-black uppercase tracking-widest"
                      onClick={() => {
                        setSelectedMethod(m);
                        setSelectedView('data');
                      }}
                    >
                      Ver datos
                    </Button>
                  </div>
                </div>
              ))}
            </div>
            <div className="pt-10 border-t space-y-8">
              <p className="text-[11px] font-black text-center text-muted-foreground uppercase tracking-[0.4em]">Reportar Pago vía WhatsApp</p>
              <div className="grid grid-cols-1 gap-6">
                <a href="https://wa.me/51929110834" target="_blank" className="h-20 bg-emerald-600 text-white rounded-3xl font-black text-xs flex items-center justify-center gap-4 shadow-xl shadow-emerald-500/20 hover:bg-emerald-700 transition-all active:scale-95 uppercase tracking-widest px-8">
                  <MessageCircle className="w-8 h-8" /> Soporte Admin 1
                </a>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(selectedMethod)}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedMethod(null);
            setSelectedView('data');
          }
        }}
      >
        <DialogContent className="sm:max-w-2xl rounded-[2.5rem] border-none shadow-[0_30px_60px_-20px_rgba(0,0,0,0.5)]">
          <DialogHeader>
            <DialogTitle className="text-2xl font-black">{selectedMethod?.label || 'Detalle del pago'}</DialogTitle>
            <DialogDescription className="text-sm font-bold text-muted-foreground">
              {selectedView === 'qr'
                ? 'Escanee el QR para completar el pago.'
                : 'Copie los datos para completar el pago.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-6">
            {selectedView === 'data' && selectedMethod?.value ? (
              <div className="bg-slate-50 dark:bg-slate-900 rounded-2xl p-6 border">
                <p className="text-sm font-black text-slate-900 dark:text-white whitespace-pre-line leading-relaxed">
                  {selectedMethod.value}
                </p>
                <div className="mt-4">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-9 rounded-xl font-black uppercase tracking-widest"
                    onClick={() => handleCopy(selectedMethod.value || '')}
                  >
                    Copiar
                  </Button>
                </div>
              </div>
            ) : null}
            {selectedView === 'data' && !selectedMethod?.value ? (
              <div className="bg-slate-50 dark:bg-slate-900 rounded-2xl p-6 border">
                <p className="text-sm font-black text-slate-900 dark:text-white leading-relaxed">
                  No hay datos disponibles para este medio de pago.
                </p>
              </div>
            ) : null}
            {selectedView === 'qr' && selectedMethod?.qrImage ? (
              <div className="flex justify-center">
                <div className="inline-block rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden bg-transparent">
                  <img
                    src={selectedMethod.qrImage}
                    className="block max-w-[70vw] max-h-[60vh] w-auto h-auto object-contain"
                    alt="QR Scan"
                  />
                </div>
              </div>
            ) : null}
            {selectedView === 'qr' && !selectedMethod?.qrImage ? (
              <div className="bg-slate-50 dark:bg-slate-900 rounded-2xl p-6 border">
                <p className="text-sm font-black text-slate-900 dark:text-white leading-relaxed">
                  No hay QR disponible para este medio de pago.
                </p>
              </div>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}

export default function ProfilePage() {
  return (
    <AuthProvider>
      <ProfileContent />
    </AuthProvider>
  );
}
