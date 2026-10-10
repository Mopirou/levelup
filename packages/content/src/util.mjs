// Fonctions communes aux générateurs de contenu (quêtes guidées et parcours).

export const slug = (s) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** Validation abrégée (`s`, `j`, `c:cible:unité`, `t:minutes`, `e:étape1|étape2`) vers un objet `ValidationSpec`. */
export function parseValidation(v) {
  if (v === 's') return { type: 'simple' };
  if (v === 'j') return { type: 'journal', minChars: 50 };
  const [k, ...rest] = v.split(':');
  if (k === 'c') return { type: 'counter', target: Number(rest[0]), unit: rest.slice(1).join(':') };
  if (k === 't') return { type: 'timer', minutes: Number(rest[0]) };
  if (k === 'e') return { type: 'steps', steps: rest.join(':').split('|') };
  throw new Error('validation inconnue ' + v);
}
