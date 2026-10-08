import { AbilityId } from './types';

export interface PathDef {
  id: string;
  name: string;
  ability: AbilityId;
  title: string;
  description: string;
}

export interface ClassDef {
  id: string;
  name: string;
  icon: string;
  masteries: [AbilityId, AbilityId];
  profile: string;
  description: string;
  favoredQuests: string[];
  paths: [PathDef, PathDef];
}

export interface LevelText {
  level: number;
  text: string;
}

export function masteriesOf(classes: readonly ClassDef[], classId: string): AbilityId[] {
  return classes.find((c) => c.id === classId)?.masteries ?? [];
}

export function pathAbilityOf(classes: readonly ClassDef[], classId: string, pathId?: string | null): AbilityId | null {
  if (!pathId) return null;
  const c = classes.find((x) => x.id === classId);
  return c?.paths.find((p) => p.id === pathId)?.ability ?? null;
}
