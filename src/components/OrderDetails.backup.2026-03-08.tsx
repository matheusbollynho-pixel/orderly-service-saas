// Backup criado em 08/03/2026
// OrderDetails.tsx original

import { useRef, useState, useEffect } from 'react';
import { ServiceOrder, OrderStatus, STATUS_LABELS, PaymentMethod } from '@/types/service-order';
import { StatusBadge } from './StatusBadge';
import { Checklist } from './Checklist';
import { SignaturePad } from './SignaturePad';
import { MaterialsNote } from './MaterialsNote';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { 
  ArrowLeft, 
  User, 
  MapPin, 
  Phone, 
  Wrench, 
  FileText,
  MessageCircle,
  Trash2,
  Loader2,
  Printer,
  Download,
  UserCheck,
  Calendar,
  Eye,
  EyeOff,
  Edit2,
  Save,
  X
} from 'lucide-react';
import { useMechanics } from '@/hooks/useMechanics';
import { useClients } from '@/hooks/useClients';
import { useTeamMembers } from '@/hooks/useTeamMembers';
import { generateOrderPDFBase64, generateOrderPDF } from '@/lib/pdfGenerator';
import { sendWhatsAppDocument, sendWhatsAppText } from '@/lib/whatsappService';

import { formatDistanceToNow, format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

// ...restante do código igual ao OrderDetails.tsx original...
