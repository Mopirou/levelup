import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import {
  Award, Ban, Bell, BookOpen, Brain, Calendar, Camera, ChartColumn, Check, ChevronDown, ChevronLeft, ChevronRight, CircleCheck, CirclePlus,
  Clock, Cloud, CloudOff, Compass, Copy, Crown, Dices, Download, Droplets, Dumbbell, Ellipsis, Eye, EyeOff, Feather, Flag, Flame, Flower2,
  Footprints, Gem, Globe, Hammer, HandHeart, Heart, House, Image, Info, KeyRound, Leaf, Library, Link, Lock, LogOut, Mail, Medal, Menu,
  MessageCircle, Minus, Moon, Mountain, Music, Palette, Pause, Pencil, Pin, Play, Plus, QrCode, RefreshCw, RotateCcw, ScanLine, Scale,
  Scroll, ScrollText, Search, Send, Settings, Share2, Shield, Shuffle, SlidersHorizontal, Smile, Sparkles, Sprout, Star, Sun, Swords, Target,
  ThumbsUp, Timer, Trash2, TrendingUp, Trophy, TriangleAlert, Undo2, UserPlus, UserRound, Users, Wifi, WifiOff, Wind, X, Zap,
  type IconNode,
} from 'lucide';

const REGISTRY: Record<string, IconNode> = {
  award: Award, ban: Ban, bell: Bell, 'book-open': BookOpen, brain: Brain, calendar: Calendar, camera: Camera, chart: ChartColumn, check: Check,
  'chevron-down': ChevronDown, 'chevron-left': ChevronLeft, 'chevron-right': ChevronRight, 'circle-check': CircleCheck, 'circle-plus': CirclePlus,
  clock: Clock, cloud: Cloud, 'cloud-off': CloudOff, compass: Compass, copy: Copy, crown: Crown, dices: Dices, download: Download, droplets: Droplets,
  dumbbell: Dumbbell, ellipsis: Ellipsis, eye: Eye, 'eye-off': EyeOff, feather: Feather, flag: Flag, flame: Flame, flower: Flower2, footprints: Footprints,
  gem: Gem, globe: Globe, hammer: Hammer, 'hand-heart': HandHeart, heart: Heart, house: House, image: Image, info: Info, key: KeyRound, leaf: Leaf,
  library: Library, link: Link, lock: Lock, 'log-out': LogOut, mail: Mail, medal: Medal, menu: Menu, message: MessageCircle, minus: Minus, moon: Moon,
  mountain: Mountain, music: Music, palette: Palette, pause: Pause, pencil: Pencil, pin: Pin, play: Play, plus: Plus, 'qr-code': QrCode, refresh: RefreshCw,
  undo: RotateCcw, undo2: Undo2, scan: ScanLine, scale: Scale, scroll: Scroll, 'scroll-text': ScrollText, search: Search, send: Send, settings: Settings,
  share: Share2, shield: Shield, shuffle: Shuffle, sliders: SlidersHorizontal, smile: Smile, sparkles: Sparkles, sprout: Sprout, star: Star, sun: Sun,
  swords: Swords, target: Target, thumbs: ThumbsUp, timer: Timer, trash: Trash2, trending: TrendingUp, trophy: Trophy, warning: TriangleAlert,
  'user-plus': UserPlus, 'user-round': UserRound, users: Users, wifi: Wifi, 'wifi-off': WifiOff, wind: Wind, x: X, zap: Zap,
};

function toSvg(node: IconNode | undefined): string {
  if (!node) return '';
  return node
    .map(([tag, attrs]) => {
      const a = Object.entries(attrs ?? {})
        .map(([k, v]) => `${k}="${String(v)}"`)
        .join(' ');
      return `<${tag} ${a}/>`;
    })
    .join('');
}

/** Icônes Lucide (comme dans les maquettes), dessinées en SVG inline. */
@Component({
  selector: 'lu-icon',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<svg
    xmlns="http://www.w3.org/2000/svg"
    [attr.width]="size()"
    [attr.height]="size()"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    [attr.stroke-width]="stroke()"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
    [innerHTML]="html()"
  ></svg>`,
  styles: `
    :host {
      display: inline-flex;
      line-height: 0;
      flex: none;
    }
  `,
})
export class IconComponent {
  private sanitizer = inject(DomSanitizer);
  readonly name = input.required<string>();
  readonly size = input(18);
  readonly stroke = input(1.9);
  readonly html = computed<SafeHtml>(() => this.sanitizer.bypassSecurityTrustHtml(toSvg(REGISTRY[this.name()])));
}
