import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Swords, PlayCircle, Users, LayoutGrid, Target, Crosshair, Trophy,
  ShieldCheck, ListOrdered, Radio, Medal, ArrowRight, Award, Skull, Crown, Megaphone,
} from 'lucide-react'
import Navbar from '../components/Navbar'
import Footer from '../components/Footer'
import StatsBar from '../components/StatsBar'
import CountdownTimer from '../components/CountdownTimer'
import logo from '../assets/logo.jpg'
import { supabase } from '../lib/supabaseClient'
import { HOME_ACTIONS } from '../config'

const formatCards = [
  {
    icon: Users,
    title: 'Phase de Qualifications',
    text: 'Les joueurs approuvés sont répartis dans les groupes A à J. Les demandes peuvent dépasser 40, puis la qualification retient les meilleurs profils selon le règlement.',
  },
  {
    icon: ListOrdered,
    title: 'Système de Repêchage',
    text: "Les 2 premiers de chaque groupe sont qualifiés. Les 12 meilleurs joueurs restants complètent les 32 places selon les points, les dégâts et les kills.",
  },
  {
    icon: Trophy,
    title: 'Phases Finales',
    text: 'Arbre à élimination directe pour les 32 qualifiés : huitièmes, quarts, demies et grande finale.',
  },
  {
    icon: Crosshair,
    title: 'Règles Aller / Retour',
    highlight: true,
    text: 'Match Aller en "One Tap" (headshot only), match Retour en "Spam" (bodyshot). Deux styles, un seul vainqueur.',
  },
]

const processSteps = [
  { n: '01', title: 'Inscription', text: 'Connexion via Google et création du profil joueur (pseudo, ID Free Fire).' },
  { n: '02', title: 'Validation', text: "Approbation manuelle de l'inscription par l'administration de la guilde." },
  { n: '03', title: 'Tirage des groupes', text: 'Répartition dans l’un des 10 groupes (A à J) de 4 joueurs.' },
  { n: '04', title: 'Phase de poules', text: 'Championnat aller simple : chacun affronte les 3 autres joueurs de son groupe.' },
  { n: '05', title: 'Phases finales', text: 'Top 32 qualifié, bracket à élimination directe jusqu’à la finale.' },
]

const prizeTiers = [
  {
    rank: 'Top 1',
    title: 'Champion du tournoi',
    color: 'from-charo-orange/20 via-orange-50 to-white',
    accent: true,
    featured: true,
    perks: [
      'Casque Gaming avec Micro',
      'Refroidisseur de Téléphone Gaming',
      '+ 200 diamants',
    ],
  },
  {
    rank: 'Top 2',
    title: 'Vice-champion',
    color: 'from-slate-100 to-white',
    accent: false,
    featured: false,
    perks: [
      'Casque Gaming avec Micro',
      '+ 200 diamants',
    ],
  },
  {
    rank: 'Top 3',
    title: 'Troisième place',
    color: 'from-amber-50 to-white',
    accent: false,
    featured: false,
    perks: [
      '450 Diamants Free Fire (ABONNEMENT HEBDOMADAIRE)',
      '+ 200 diamants',
    ],
  },
]

export default function Landing() {
  const [announcements, setAnnouncements] = useState([])

  useEffect(() => {
    const load = async () => {
      const { data: announceRows } = await supabase
        .from('announcements')
        .select('id, title, body, category, image_url, created_at')
        .eq('published', true)
        .order('created_at', { ascending: false })
        .limit(3)

      setAnnouncements(announceRows || [])
    }
    load()

    const channel = supabase
      .channel?.('landing-live')
      ?.on?.('postgres_changes', { event: '*', schema: 'public', table: 'announcements' }, load)
      ?.subscribe?.()
    return () => { if (channel) supabase.removeChannel?.(channel) }
  }, [])

  return (
    <div className="min-h-screen">
      <Navbar />

      {/* ================= HERO ================= */}
      <section className="relative overflow-hidden bg-radial-glow">
        <div className="max-w-7xl mx-auto px-5 lg:px-8 pt-16 pb-20 lg:pt-24 lg:pb-28 grid lg:grid-cols-2 gap-14 items-center">
          <div>
            <span className="eyebrow mb-6">17 Août — 10 Octobre 2026</span>
            <h1 className="font-display text-5xl md:text-6xl xl:text-[4.2rem] leading-[0.98] tracking-wide text-ink-800">
              ON SE BAT.<br />
              ON <span className="text-charo-orange">DOMINE</span>.<br />
              UN SEUL <span className="text-charo-orange">CHARO</span> RESTE.
            </h1>
            <p className="text-ink-600 text-base md:text-lg max-w-lg mb-8 leading-relaxed">
              La Bataille des Charos réunit les joueurs Free Fire approuvés dans un tournoi solo 1v1 sans pitié :
              poules, repêchage, bracket à élimination directe. Scores en cours, arbre du tournoi, un seul champion.
            </p>
            <div className="home-actions-grid mb-10">
              {HOME_ACTIONS.map((action, index) => {
                const Icon = index === 0 ? Swords : index === 1 ? Trophy : index === 2 ? Swords : Megaphone
                const variant = action.variant === 'primary' ? 'home-action-primary' : action.variant === 'dark' ? 'home-action-dark' : ''
                return (
                  <Link key={action.to} to={action.to} className={`home-action ${variant}`}>
                    <Icon size={18} strokeWidth={index === 0 || index === 2 ? 2.5 : 2} />
                    <span>{action.label}</span>
                  </Link>
                )
              })}
            </div>
            <div className="guild-leader">
              <span>CHEF DE GUILDE</span>
              <strong>AMEGLADJA</strong>
              <em>« Méchant Méchant »</em>
            </div>

            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-ink-600 mb-3">Coup d'envoi dans</p>
              <CountdownTimer targetDate="2026-08-17T00:00:00" />
            </div>
          </div>

          <div className="relative">
            <div className="absolute -inset-6 bg-charo-gradient opacity-20 blur-3xl rounded-full" />
            <div className="relative card p-3">
              <img
                src={logo}
                alt="Guilde Méchantcharo"
                className="w-full aspect-square object-cover rounded-xl"
              />
              <div className="absolute top-6 left-6 badge-open">
                <span className="w-1.5 h-1.5 rounded-full bg-live animate-ping" /> Inscriptions ouvertes
              </div>
            </div>
          </div>
        </div>

        <div className="max-w-7xl mx-auto px-5 lg:px-8 -mt-4 lg:-mt-6 pb-16">
          <StatsBar />
        </div>
      </section>

      {/* ================= FORMAT (section claire, comme la maquette) ================= */}
      <section className="bg-white text-ink-950 py-20 lg:py-28">
        <div className="max-w-7xl mx-auto px-5 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-10 items-end mb-14">
            <div>
              <span className="inline-flex items-center gap-2 text-xs font-bold tracking-[0.2em] uppercase text-charo-orange mb-4">
                <span className="w-2 h-2 rounded-full bg-charo-orange" /> Format de la compétition
              </span>
              <h2 className="font-display text-4xl md:text-5xl leading-tight">
                Une mécanique <span className="text-charo-orange">chirurgicale</span>
                <br />pour les prétendants approuvés.
              </h2>
            </div>
            <p className="text-ink-950/60 max-w-md text-base leading-relaxed">
              Chaque étape est pensée pour être équitable, spectaculaire et 100% transparente,
              du premier match de poule jusqu'à la grande finale.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {formatCards.map(({ icon: Icon, title, text, highlight }) => (
              <div
                key={title}
                className={`rounded-2xl p-6 border transition-transform hover:-translate-y-1 ${
                  highlight
                    ? 'bg-ink-950 border-ink-950 text-white'
                    : 'bg-white border-ink-950/10 text-ink-950'
                }`}
              >
                <div className={`w-11 h-11 rounded-xl flex items-center justify-center mb-5 ${
                  highlight ? 'bg-charo-orange text-ink-950' : 'bg-charo-orange/10 text-charo-orange'
                }`}>
                  <Icon size={20} />
                </div>
                <h3 className="font-bold text-lg mb-2.5">{title}</h3>
                <p className={`text-sm leading-relaxed ${highlight ? 'text-white/75' : 'text-ink-950/60'}`}>{text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ================= IMPACT / STATS ================= */}
      <section className="py-20 lg:py-28">
        <div className="max-w-7xl mx-auto px-5 lg:px-8 grid lg:grid-cols-2 gap-14 items-center">
          <div>
            <span className="eyebrow mb-5">Notre impact</span>
            <h2 className="font-display text-4xl md:text-5xl leading-tight mb-6 text-ink-800">
              Une compétition<br /><span className="text-charo-orange">sans précédent.</span>
            </h2>
            <div className="grid grid-cols-2 gap-6 mb-9">
              {[
                { v: '40+', l: 'Joueurs engagés' },
                { v: '10', l: 'Groupes de poules' },
                { v: '60+', l: 'Matchs de qualification' },
                { v: '32', l: 'Places en phases finales' },
              ].map((s) => (
                <div key={s.l}>
                  <p className="font-display text-4xl text-charo-orange">{s.v}</p>
                  <p className="text-sm text-ink-600 mt-1">{s.l}</p>
                </div>
              ))}
            </div>
            <Link to="/groupes" className="btn-primary">
              Voir les classements <ArrowRight size={18} />
            </Link>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="card p-5 flex flex-col justify-between h-44">
              <ShieldCheck className="text-charo-orange" size={22} />
              <div>
                <p className="font-display text-2xl text-ink-950">RLS</p>
                <p className="text-xs text-ink-600">Sécurité des données joueurs</p>
              </div>
            </div>
            <div className="card p-5 flex flex-col justify-between h-44 mt-8">
              <Radio className="text-charo-orange" size={22} />
              <div>
                <p className="font-display text-2xl text-ink-950">En cours</p>
                <p className="text-xs text-ink-600">Scores synchronisés en temps réel</p>
              </div>
            </div>
            <div className="card p-5 flex flex-col justify-between h-44">
              <LayoutGrid className="text-charo-orange" size={22} />
              <div>
                <p className="font-display text-2xl text-ink-950">Bracket</p>
                <p className="text-xs text-ink-600">Progression automatisée</p>
              </div>
            </div>
            <div className="card p-5 flex flex-col justify-between h-44 mt-8">
              <Skull className="text-charo-orange" size={22} />
              <div>
                <p className="font-display text-2xl text-ink-950">1v1</p>
                <p className="text-xs text-ink-600">Aucune place pour l'erreur</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ================= ANNONCES DE LA GUILDE ================= */}
      <section className="py-20 lg:py-24 border-t border-ink-700">
        <div className="max-w-7xl mx-auto px-5 lg:px-8">
          <div className="flex flex-wrap items-end justify-between gap-6 mb-10">
            <div>
              <span className="eyebrow mb-4"><Megaphone size={13} /> Vie de la guilde</span>
              <h2 className="font-display text-4xl md:text-5xl text-ink-900">Annonces de la guilde</h2>
              <p className="text-ink-600 mt-3 max-w-xl">Les dernières informations publiées par l'administration de MÉCHANTCHARO.</p>
            </div>
            <Link to="/annonces" className="btn-primary">
              Voir plus <ArrowRight size={16} />
            </Link>
          </div>

          <div className="grid md:grid-cols-3 gap-5">
            {announcements.map((a) => (
              <Link key={a.id} to="/annonces" className="card overflow-hidden group hover:border-charo-orange/50 transition-all">
                {a.image_url && (
                  <div className="aspect-[16/8] overflow-hidden bg-ink-800">
                    <img src={a.image_url} alt="" className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-300" />
                  </div>
                )}
                <div className="p-6">
                  <div className="flex items-center justify-between gap-3 mb-3">
                    <span className="category-pill">{a.category || 'Information'}</span>
                    <span className="text-[11px] text-ink-600">{new Date(a.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}</span>
                  </div>
                  <h3 className="font-bold text-lg text-ink-950 line-clamp-2">{a.title || 'Annonce de la guilde'}</h3>
                  <p className="text-sm text-ink-600 leading-relaxed mt-2 line-clamp-3">{a.body}</p>
                  <span className="inline-flex items-center gap-1.5 mt-5 text-xs font-extrabold uppercase tracking-wide text-charo-orange">Lire l'annonce <ArrowRight size={13} /></span>
                </div>
              </Link>
            ))}
            {announcements.length === 0 && (
              <div className="md:col-span-3 rounded-2xl border border-ink-700 bg-ink-800 p-10 text-center">
                <Megaphone className="mx-auto text-charo-orange mb-3" size={22} />
                <p className="font-bold">Aucune annonce pour le moment</p>
                <p className="text-sm text-ink-600 mt-1">Les prochaines informations de la guilde apparaîtront ici.</p>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ================= PROCESS ================= */}
      <section className="py-20 lg:py-28 border-t border-ink-700">
        <div className="max-w-7xl mx-auto px-5 lg:px-8">
          <span className="eyebrow mb-4">Comment participer</span>
          <h2 className="font-display text-4xl md:text-5xl mb-14 max-w-xl text-ink-900">Du Début à la grande finale.</h2>

          <div className="grid md:grid-cols-5 gap-5">
            {processSteps.map((s, i) => (
              <div key={s.n} className="relative">
                <p className="font-display text-5xl text-ink-600 mb-4">{s.n}</p>
                <h3 className="font-bold text-ink-950 mb-2">{s.title}</h3>
                <p className="text-sm text-ink-600 leading-relaxed">{s.text}</p>
                {i < processSteps.length - 1 && (
                  <div className="hidden md:block absolute top-6 -right-3 w-6 h-px bg-ink-700" />
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ================= LOTS & DOTATIONS ================= */}
      <section className="py-20 lg:py-28 border-t border-ink-700">
        <div className="max-w-7xl mx-auto px-5 lg:px-8">
          <span className="eyebrow mb-4 text-charo-orange">Récompenses</span>
          <h2 className="font-display text-4xl md:text-5xl mb-14 max-w-xl text-ink-900">Lots &amp; dotations.</h2>

          <div className="grid md:grid-cols-3 gap-6 items-stretch">
            {prizeTiers.map((t) => (
              <div
                key={t.rank}
                className={`rounded-2xl border bg-gradient-to-b ${t.color} ${
                  t.featured
                    ? 'md:col-span-1 p-10 md:-mt-4 md:mb-[-1rem] border-charo-orange shadow-glow ring-2 ring-charo-orange/20 scale-[1.02] z-10'
                    : 'p-8 border-ink-700'
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${
                    t.featured
                      ? 'bg-charo-orange text-white shadow-glow'
                      : 'bg-ink-800 text-ink-600'
                  }`}>
                    {t.featured ? <Crown size={22} /> : <Award size={22} />}
                  </div>
                  {t.featured && (
                    <span className="rounded-full bg-charo-orange text-white text-[11px] font-bold uppercase tracking-wider px-3 py-1">
                      Grand gagnant
                    </span>
                  )}
                </div>

                <p className={`font-display text-4xl text-ink-950 ${t.featured ? 'mt-6' : 'mt-4'}`}>{t.rank}</p>
                <p className={`text-sm text-ink-600 ${t.featured ? 'mb-7' : 'mb-6'}`}>{t.title}</p>

                <ul className={`space-y-3 ${t.featured ? 'mb-8' : 'mb-7'}`}>
                  {t.perks.map((perk) => (
                    <li key={perk} className={`flex items-start gap-2.5 text-ink-950 ${t.featured ? 'text-base font-semibold' : 'text-sm'}`}>
                      <Medal size={t.featured ? 16 : 14} className="text-charo-orange shrink-0 mt-0.5" />
                      <span>{perk}</span>
                    </li>
                  ))}
                </ul>

                <Link to="/reglement" className={t.featured ? 'btn-primary w-full' : 'btn-outline w-full'}>
                  Voir le règlement
                </Link>
              </div>
            ))}
          </div>

          <div className="mt-8 rounded-2xl border border-charo-orange/25 bg-charo-orange/5 p-5 md:p-6">
            <div className="flex flex-col md:flex-row md:items-center gap-3 md:gap-5">
              <div className="w-10 h-10 rounded-xl bg-charo-orange/10 flex items-center justify-center text-charo-orange shrink-0">
                <Trophy size={20} />
              </div>
              <div>
                <p className="font-bold text-ink-900">MVP du tournoi</p>
                <p className="text-sm text-ink-600 mt-1">400 diamants, attribués par les juges selon les performances, la régularité, le niveau de jeu, le fair-play et l’impact sur la compétition.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ================= CTA FINAL ================= */}
      <section className="py-20 lg:py-28">
        <div className="max-w-7xl mx-auto px-5 lg:px-8">
          <div className="rounded-3xl bg-charo-gradient p-10 md:p-16 flex flex-col lg:flex-row items-center justify-between gap-8 relative overflow-hidden">
            <Target size={220} className="absolute -right-10 -bottom-10 text-ink-950/10" />
            <div className="relative">
              <h2 className="font-display text-4xl md:text-5xl text-ink-950 mb-3">Prêt à entrer dans l'arène ?</h2>
              <p className="text-ink-950/70 max-w-md">Connecte-toi avec Google, valide ton profil et rejoins l'un des 10 groupes de la Bataille des Charos.</p>
            </div>
            <Link to="/connexion" className="relative inline-flex items-center gap-2 rounded-xl bg-ink-950 text-white font-bold px-7 py-4 hover:bg-ink-900 transition-colors shrink-0">
              <Swords size={18} /> Je m'inscris
            </Link>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  )
}
