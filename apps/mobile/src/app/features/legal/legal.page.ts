import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { IonContent } from '@ionic/angular';
import { env } from '../../core/env';
import { PageHeaderComponent } from '../../shared/ui';

interface Doc {
  title: string;
  updated: string;
  sections: { h: string; p: string[] }[];
}

const UPDATED = 'octobre 2026';
const C = env.contactEmail;

/**
 * Documents obligatoires (cahier des charges §10.1) : modèles complets à faire relire et compléter par un juriste
 * avant la mise en production (identité de l'éditeur, hébergeurs, durées de conservation exactes).
 */
const DOCS: Record<string, Doc> = {
  terms: {
    title: 'Conditions d’utilisation',
    updated: UPDATED,
    sections: [
      { h: '1. Objet', p: ['Level Up est une application de développement personnel gamifiée et sociale. Elle permet de créer un personnage, d’accomplir des quêtes inspirées d’actions réelles, de gagner de l’expérience (XP) et de partager ses réussites avec un cercle d’amis. Les présentes conditions encadrent son utilisation.'] },
      { h: '2. Accès au service', p: ['Le service est réservé aux personnes âgées d’au moins 15 ans. L’âge est vérifié par l’année de naissance indiquée à l’inscription. Chaque utilisateur dispose d’un compte et d’un seul personnage.', 'Tu es responsable de la confidentialité de ton mot de passe et des actions réalisées depuis ton compte.'] },
      { h: '3. Contenus et comportement', p: ['Tu restes propriétaire des contenus (photos, textes) que tu publies et nous accordes le droit de les afficher aux personnes avec lesquelles tu choisis de les partager, uniquement pour faire fonctionner le service.', 'Sont interdits : les contenus illicites, haineux, harcelants, sexuels, violents, portant atteinte à la vie privée d’autrui, ou à caractère publicitaire. Voir les Règles de la communauté.', 'Les quêtes ne remplacent pas un avis médical. Adapte chaque défi physique à ta condition et consulte un professionnel de santé en cas de doute.'] },
      { h: '4. Modération', p: ['Tu peux signaler un contenu, bloquer un utilisateur ou supprimer ton compte à tout moment dans l’application. Un contenu signalé par plusieurs personnes est masqué en attendant l’examen de la modération, visé sous 48 heures.', 'Nous pouvons suspendre ou supprimer un compte en cas de manquement grave ou répété.'] },
      { h: '5. Données personnelles', p: ['Le traitement de tes données est décrit dans la Politique de confidentialité.'] },
      { h: '6. Responsabilité', p: ['Le service est fourni en l’état. Nous ne garantissons pas une disponibilité ininterrompue. Level Up est un outil de motivation : il ne délivre aucun conseil médical, psychologique ou professionnel.'] },
      { h: '7. Évolution des conditions', p: ['Les conditions peuvent évoluer ; tu en seras informé dans l’application. Le droit français s’applique.'] },
      { h: '8. Contact', p: [`Pour toute question : ${C}.`] },
    ],
  },
  privacy: {
    title: 'Politique de confidentialité',
    updated: UPDATED,
    sections: [
      { h: '1. Qui est responsable ?', p: ['Le responsable du traitement est l’éditeur de Level Up (voir Mentions légales). Contact : ' + C + '.'] },
      { h: '2. Données collectées', p: ['Compte : adresse e-mail, mot de passe (chiffré), année de naissance, pseudo.', 'Jeu : personnage, quêtes, XP, trophées, journal et serment (privés), réglages.', 'Social : amis, publications, photos, réactions, commentaires, notifications, signalements, blocages.', 'Technique : jeton de notification (si tu les actives), journaux d’erreurs anonymisés.', 'Nous ne collectons aucune géolocalisation. Les métadonnées de tes photos (dont la position GPS) sont supprimées sur ton téléphone avant l’envoi. Aucun traceur publicitaire n’est utilisé. Les statistiques d’usage anonymes ne sont activées qu’avec ton consentement.'] },
      { h: '3. Finalités et bases légales', p: ['Fournir le service (exécution du contrat), assurer la sécurité et la modération (intérêt légitime), t’envoyer des notifications (consentement), respecter nos obligations légales.'] },
      { h: '4. Qui voit quoi ?', p: ['Ta fiche (niveau, scores, classe, trophées) est visible par tes amis acceptés uniquement. Tes publications « Compagnons » le sont aussi ; celles marquées « Privé » ne le sont que de toi. Ton serment, ton journal et tes notes ne sont jamais visibles par les autres. Tout utilisateur connecté peut te trouver par ton pseudo (nom, avatar, niveau) pour te proposer une demande d’ami, sauf si tu l’as désactivé dans les réglages.'] },
      { h: '5. Hébergement et transferts', p: ['Les données sont hébergées dans l’Union européenne (Supabase, région UE). Les notifications transitent par les services de notification des systèmes (Firebase Cloud Messaging, APNs).'] },
      { h: '6. Durées de conservation', p: ['Tes données sont conservées tant que ton compte est actif. À la suppression du compte, tes publications, photos, commentaires et réactions sont retirés immédiatement ; tes données personnelles sont effacées sous 30 jours ; ton pseudo reste réservé 90 jours.'] },
      { h: '7. Tes droits', p: ['Accès et portabilité : « Mes données » dans le Campement télécharge un fichier JSON et tes photos. Rectification : modifie ton profil dans le Campement. Effacement : « Supprimer mon compte » dans le Campement. Opposition, limitation : écris-nous à ' + C + '. Tu peux saisir la CNIL (cnil.fr).'] },
      { h: '8. Sécurité', p: ['Connexions chiffrées (HTTPS), accès aux données restreints par des règles strictes (chaque utilisateur ne lit que ses données et celles de ses amis), photos stockées dans un espace privé avec liens signés temporaires.'] },
    ],
  },
  community: {
    title: 'Règles de la communauté',
    updated: UPDATED,
    sections: [
      { h: 'Un village bienveillant', p: ['Ici, on s’encourage. Pas de classement des « meilleurs », pas de course aux likes : juste des compagnons qui avancent côte à côte.'] },
      { h: 'Ce que nous attendons de toi', p: ['Respecte les autres : pas d’insultes, de moqueries, de harcèlement, de propos haineux ou discriminatoires.', 'Ne publie que des photos qui te concernent ou dont tu as l’accord des personnes visibles. Pas de contenu sexuel, violent ou choquant.', 'Ne partage pas d’informations personnelles (adresse, téléphone) dans le fil.', 'Pas de publicité, de spam, de promotion de régimes extrêmes ou de défis dangereux.'] },
      { h: 'Signaler, bloquer', p: ['Un contenu te dérange ? Utilise le menu « ⋯ » pour signaler ou bloquer. Un contenu signalé par trois personnes différentes est masqué en attendant la modération, qui le traite sous 48 heures.', 'Un filtre de mots interdits s’applique aux publications et commentaires.'] },
      { h: 'Sanctions', p: ['Les contenus contraires à ces règles sont retirés. Les manquements répétés ou graves peuvent entraîner la suspension du compte.'] },
      { h: 'Contact', p: [`Une urgence, un doute : ${C}.`] },
    ],
  },
  'legal-notice': {
    title: 'Mentions légales',
    updated: UPDATED,
    sections: [
      { h: 'Éditeur', p: ['[Nom ou raison sociale], [forme juridique], [capital], [adresse], [SIREN/RCS], directeur de la publication : [nom].', 'Contact : ' + C + '.'] },
      { h: 'Hébergement', p: ['Application web : [hébergeur, adresse]. Base de données et fichiers : Supabase (région Union européenne).'] },
      { h: 'Propriété intellectuelle', p: ['Level Up, son nom, son univers, ses textes et illustrations sont protégés. Toute reproduction non autorisée est interdite.'] },
      { h: 'À compléter', p: ['Ces mentions sont un modèle : renseigne les informations de l’éditeur avant la mise en ligne.'] },
    ],
  },
  credits: {
    title: 'Crédits',
    updated: UPDATED,
    sections: [
      { h: 'Level Up', p: ['Conception, écriture des quêtes et du contenu, développement. L’univers s’inspire de la structure des jeux de rôle (système D&D 5e, recalibré pour le développement personnel).'] },
      { h: 'Technologies', p: ['Ionic, Angular, Capacitor, Supabase, Chart.js, Lucide (icônes), polices Lora et Inter.'] },
    ],
  },
};

@Component({
  selector: 'app-legal',
  imports: [IonContent, PageHeaderComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ion-content [fullscreen]="true">
      <lu-page-header [back]="true" eyebrow="Documents" icon="scroll-text" [title]="doc().title" />
      <div class="lu-page">
        <p class="xs muted">Dernière mise à jour : {{ doc().updated }}</p>
        @for (s of doc().sections; track s.h) {
          <section class="lu-section">
            <h2 class="h">{{ s.h }}</h2>
            @for (p of s.p; track $index) { <p class="lu-lead">{{ p }}</p> }
          </section>
        }
      </div>
    </ion-content>
  `,
  styles: '.h { font-size: 19px; }',
})
export class LegalPage {
  readonly doc$ = input.required<string>({ alias: 'doc' });
  readonly doc = computed(() => DOCS[this.doc$()] ?? DOCS['terms']);
}
