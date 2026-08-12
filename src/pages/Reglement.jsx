import { Crosshair, Target, Users, ListOrdered, Trophy, Award } from 'lucide-react'
import Navbar from '../components/Navbar'
import Footer from '../components/Footer'

const sections = [
  {
    icon: Users,
    title: '1. Format de la compétition',
    items: [
      '40 joueurs répartis en 10 groupes (A à J) de 4 joueurs.',
      'Phase de poules en championnat : chaque joueur affronte les 3 autres de son groupe.',
      'Phases finales : élimination directe pour les 32 qualifiés (huitièmes, quarts, demies, finale).',
    ],
  },
  {
    icon: ListOrdered,
    title: '2. Système de qualification',
    items: [
      "Les 10 premiers de chaque groupe sont qualifiés d'office.",
      'Les 2 premiers de chaque groupe sont qualifiés (20 joueurs), puis les 12 meilleurs joueurs restants sont repêchés selon les points, les dégâts puis les kills pour former 32 qualifiés.',
    ],
  },
  {
    icon: Crosshair,
    title: '3. Règles des matchs (Aller / Retour)',
    items: [
      'Match Aller : règle "One Tap" — seuls les headshots comptent.',
      'Match Retour : règle "Spam" — les tirs corps (bodyshot) comptent.',
      'Le vainqueur d\'un match est automatiquement propagé au tour suivant du bracket.',
    ],
  },
  {
    icon: Trophy,
    title: '4. Déroulement des phases finales',
    items: [
      'Seizièmes de finale à partir des 32 qualifiés.',
      'Progression par élimination directe jusqu\'à la grande finale.',
      'Navigation de l\'arbre par swipe horizontal sur mobile.',
    ],
  },
  {
    icon: Award,
    title: '5. Lots & dotations',
    items: [
      'Récompenses pour le Top 1, Top 2 et Top 3.',
      'Titre de MVP du tournoi décerné en plus du podium.',
    ],
  },
]

export default function Reglement() {
  return (
    <div className="min-h-screen">
      <Navbar />

      <section className="py-14 lg:py-20">
        <div className="max-w-4xl mx-auto px-5 lg:px-8">
          <span className="eyebrow mb-4"><Target size={12} className="inline -mt-0.5" /> Règlement officiel</span>
          <h1 className="font-display text-4xl md:text-5xl mb-4">Les règles de la Bataille</h1>
          <p className="text-ink-600 mb-14 max-w-xl">
            Le règlement complet de "La Bataille des Charos", organisé par la guilde MÉCHANTCHARO.
            À lire avant toute inscription.
          </p>

          <div className="space-y-6">
            {sections.map(({ icon: Icon, title, items }) => (
              <div key={title} className="card p-7">
                <div className="flex items-center gap-3 mb-5">
                  <div className="w-10 h-10 rounded-xl bg-charo-orange/10 border border-charo-orange/30 flex items-center justify-center text-charo-orange">
                    <Icon size={18} />
                  </div>
                  <h2 className="font-bold text-lg text-ink-950">{title}</h2>
                </div>
                <ul className="space-y-2.5 pl-1">
                  {items.map((it) => (
                    <li key={it} className="flex gap-3 text-sm text-ink-600 leading-relaxed">
                      <span className="w-1.5 h-1.5 rounded-full bg-charo-orange mt-1.5 shrink-0" />
                      {it}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      <Footer />
    </div>
  )
}
