import {
  Bell,
  Boxes,
  Clock,
  Cloud,
  Cpu,
  CreditCard,
  Database,
  FileText,
  Folder,
  GitBranch,
  Globe,
  HardDrive,
  Key,
  Layers,
  Lock,
  Mail,
  MessageSquare,
  Network,
  Radio,
  Router,
  Search,
  Server,
  ShieldCheck,
  ShoppingCart,
  Terminal,
  User,
  Users,
  Zap,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

/** Curated icon set for `custom_types[].icon` (PLAN.md step 10.8) — a
 * small, statically-imported allow-list rather than `lucide-react`'s
 * `DynamicIcon`, whose data-driven `import()` makes Vite emit one chunk
 * per icon in the *entire* library (~1700 files, ~9MB) regardless of how
 * many are actually used (see docs/deviations.md, step 10.8). An icon
 * name outside this set simply doesn't render — consistent with `icon`
 * being explicitly best-effort in docs/format.md. */
export const CUSTOM_TYPE_ICONS: Record<string, LucideIcon> = {
  database: Database,
  server: Server,
  cloud: Cloud,
  lock: Lock,
  globe: Globe,
  cpu: Cpu,
  'hard-drive': HardDrive,
  mail: Mail,
  'message-square': MessageSquare,
  bell: Bell,
  'shield-check': ShieldCheck,
  key: Key,
  boxes: Boxes,
  'git-branch': GitBranch,
  network: Network,
  router: Router,
  radio: Radio,
  terminal: Terminal,
  clock: Clock,
  users: Users,
  user: User,
  'credit-card': CreditCard,
  'shopping-cart': ShoppingCart,
  'file-text': FileText,
  folder: Folder,
  search: Search,
  zap: Zap,
  layers: Layers,
};
