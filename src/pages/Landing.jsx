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
import MatchCard from '../components/MatchCard'
import logo from '../assets/logo.jpg'
import { supabase } from '../lib/supabaseClient'

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
  const [featuredMatches, setFeaturedMatches] = useState([])

  useEffect(() => {
    const load = async () => {
      const [{ data: announceRows }, { data: matchRows }] = await Promise.all([
        supabase.from('announcements').select('id, title, body, created_at').eq('published', true).order('created_at', { ascending: false }).limit(3),
        supabase
          .from('matches')
          .select('id, phase, round_label, match_type, status, scheduled_at, score1, score2, damage1, damage2, player1:profiles!matches_player1_id_fkey(pseudo), player2:profiles!matches_player2_id_fkey(pseudo)')
          .eq('is_featured', true)
          .order('scheduled_at', { ascending: true, nullsFirst: false })
          .limit(3),
      ])

      setAnnouncements(announceRows || [])
      setFeaturedMatches((matchRows || []).map((m) => ({
        player1: m.player1?.pseudo || 'Joueur 1',
        player2: m.player2?.pseudo || 'Joueur 2',
        score1: m.score1, score2: m.score2, damage1: m.damage1, damage2: m.damage2,
        status: m.status, matchType: m.match_type,
        roundLabel: m.round_label || (m.phase === 'poule' ? 'Poule' : m.phase),
        scheduledAt: m.scheduled_at ? new Date(m.scheduled_at).toLocaleString('fr-FR', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' }) : null,
      })))
    }
    load()

    const channel = supabase
      .channel?.('landing-live')
      ?.on?.('postgres_changes', { event: '*', schema: 'public', table: 'announcements' }, load)
      ?.on?.('postgres_changes', { event: '*', schema: 'public', table: 'matches' }, load)
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
              poules, repêchage, bracket à élimination directe. Score en direct, arbre live, un seul champion.
            </p>
            <div className="flex flex-wrap items-center gap-4 mb-10">
              <Link to="/connexion" className="btn-primary">
                <Swords size={18} strokeWidth={2.5} /> Rejoindre le tournoi
              </Link>
              <Link to="/classement"  className="btn-primary">
                <PlayCircle size={18}  /> Voir le classement
              </Link>
               <Link to="/matchs" className="btn-primary">
                <Swords size={18} strokeWidth={2.5} /> Voir les matches
              </Link>
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
              <div className="absolute top-6 left-6 badge-live">
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
            <h2 className="font-display text-4xl md:text-5xl leading-tight mb-6">
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
                <p className="font-display text-2xl text-ink-950">Live</p>
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

      {/* ================= MATCHS À LA UNE ================= */}
      <section className="py-20 lg:py-28 border-t border-ink-700">
        <div className="max-w-7xl mx-auto px-5 lg:px-8">
          <div className="flex flex-wrap items-end justify-between gap-6 mb-12">
            <div>
              <span className="eyebrow mb-4">Suivi en direct</span>
              <h2 className="font-display text-4xl md:text-5xl">Matchs à la une</h2>
            </div>
            <Link to="/dashboard" className="btn-primary">
              Dashboard complet <ArrowRight size={16} />
            </Link>
          </div>

          <div className="grid md:grid-cols-3 gap-5">
            {featuredMatches.map((m, i) => <MatchCard key={i} match={m} />)}
            {featuredMatches.length === 0 && (
              <p className="text-ink-600 col-span-full text-center py-12">
                Aucun match mis en avant pour l'instant — reviens bientôt.
              </p>
            )}
          </div>
        </div>
      </section>

      {/* ================= ANNONCES ================= */}
      {announcements.length > 0 && (
        <section className="py-16 border-t border-ink-700">
          <div className="max-w-7xl mx-auto px-5 lg:px-8">
            <div className="flex items-center gap-2.5 mb-8">
              <Megaphone size={18} className="text-charo-orange" />
              <h2 className="font-display text-2xl md:text-3xl">Annonces de la guilde</h2>
            </div>
            <div className="grid md:grid-cols-3 gap-5">
              {announcements.map((a) => (
                <div key={a.id} className="card p-6">
                  {a.title && <p className="font-bold mb-1.5">{a.title}</p>}
                  <p className="text-sm text-ink-600 leading-relaxed">{a.body}</p>
                  <p className="text-[11px] text-ink-600 mt-3">{new Date(a.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ================= PROCESS ================= */}
      <section className="py-20 lg:py-28 border-t border-ink-700">
        <div className="max-w-7xl mx-auto px-5 lg:px-8">
          <span className="eyebrow mb-4">Comment participer</span>
          <h2 className="font-display text-4xl md:text-5xl mb-14 max-w-xl">Du sofa à la grande finale.</h2>

          <div className="grid md:grid-cols-5 gap-5">
            {processSteps.map((s, i) => (
              <div key={s.n} className="relative">
                <p className="font-display text-5xl text-ink-700 mb-4">{s.n}</p>
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
          <span className="eyebrow mb-4">Récompenses</span>
          <h2 className="font-display text-4xl md:text-5xl mb-14 max-w-xl">Lots &amp; dotations.</h2>

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
                      : 'bg-ink-100 text-ink-700'
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
                <p className="font-bold text-ink-800">MVP du tournoi</p>
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
