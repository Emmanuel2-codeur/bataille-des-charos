import { useEffect, useMemo, useState } from 'react'
import {
  CalendarDays,
  Clock3,
  Filter,
  History,
  LoaderCircle,
  Radio,
  Swords,
} from 'lucide-react'
import { Link } from 'react-router-dom'

import Navbar from '../components/Navbar'
import Footer from '../components/Footer'
import { supabase } from '../lib/supabaseClient'

const filters = [
  { key: 'all', label: 'Tous les matchs', icon: Filter },
  { key: 'in_progress', label: 'En cours', icon: Radio },
  { key: 'scheduled', label: 'À venir', icon: Clock3 },
]

const typeMeta = {
  onetap: {
    label: 'One Tap',
    detail: 'Headshot Only',
  },
  spam: {
    label: 'Spam',
    detail: 'Bodyshot',
  },
}

function effectiveStatus(match, now = Date.now()) {
  if (match.status === 'in_progress') return 'in_progress'

  if (
    match.status === 'scheduled' &&
    match.scheduled_at &&
    new Date(match.scheduled_at).getTime() <= now &&
    !match.status_override
  ) {
    return 'in_progress'
  }

  return 'scheduled'
}

function formatDate(date) {
  if (!date) return 'Horaire à confirmer'

  return new Date(date).toLocaleString('fr-FR', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function sectionMeta(status) {
  return {
    in_progress: {
      title: 'En cours',
      subtitle: 'Les affrontements actuellement en train de se jouer',
      icon: Radio,
      badge: '● EN COURS',
    },

    scheduled: {
      title: 'À venir',
      subtitle: 'Les prochaines rencontres programmées par la guilde',
      icon: Clock3,
      badge: 'À VENIR',
    },
  }[status]
}

export default function Matchs() {
  const [matches, setMatches] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState('all')
  const [now, setNow] = useState(Date.now())

  const loadMatches = async () => {
    setError('')

    const { data, error: queryError } = await supabase
      .from('matches')
      .select(`
        id,
        phase,
        round_label,
        match_type,
        scheduled_at,
        status,
        status_override,
        score1,
        score2,
        damage1,
        damage2,
        player1:profiles!matches_player1_id_fkey (
          id,
          pseudo
        ),
        player2:profiles!matches_player2_id_fkey (
          id,
          pseudo
        ),
        groups (
          name
        )
      `)
      .in('status', ['scheduled', 'in_progress'])
      .order('scheduled_at', {
        ascending: true,
        nullsFirst: false,
      })

    if (queryError) {
      console.error(queryError)
      setError('Impossible de charger les matchs.')
    } else {
      setMatches(data || [])
    }

    setLoading(false)
  }

  useEffect(() => {
    loadMatches()

    const channel = supabase
      .channel('matchs-programmes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'matches',
        },
        loadMatches
      )
      .subscribe()

    const interval = window.setInterval(
      () => setNow(Date.now()),
      15000
    )

    return () => {
      supabase.removeChannel(channel)
      window.clearInterval(interval)
    }
  }, [])

  const mapped = useMemo(
    () =>
      matches.map((match) => ({
        ...match,
        status: effectiveStatus(match, now),
      })),
    [matches, now]
  )

  const sorted = useMemo(
    () =>
      [...mapped].sort((a, b) => {
        const order = {
          in_progress: 0,
          scheduled: 1,
        }

        const statusDiff =
          order[a.status] - order[b.status]

        if (statusDiff !== 0) return statusDiff

        return (
          new Date(a.scheduled_at || '2999-01-01') -
          new Date(b.scheduled_at || '2999-01-01')
        )
      }),
    [mapped]
  )

  const visible = sorted.filter(
    (match) =>
      filter === 'all' ||
      match.status === filter
  )

  const counts = {
    all: sorted.length,
    in_progress: sorted.filter(
      (match) => match.status === 'in_progress'
    ).length,
    scheduled: sorted.filter(
      (match) => match.status === 'scheduled'
    ).length,
  }

  return (
    <div className="min-h-screen bg-white text-ink-950">
      <Navbar />

      <main className="max-w-6xl mx-auto px-5 py-12 lg:py-16">

        {/* EN-TÊTE */}
        <div className="mb-8">

          <span className="eyebrow">
            <CalendarDays size={12} />
            LA BATAILLE DES CHAROS
          </span>

          <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-5 mt-3">

            <div>
              <h1 className="font-display text-4xl md:text-5xl">
                Matchs programmés
              </h1>

              <p className="text-ink-600 mt-3 max-w-2xl">
                Les matchs en cours apparaissent en premier,
                suivis des prochaines rencontres. Une fois le
                résultat validé par l'administration, le match
                rejoint automatiquement l'historique.
              </p>
            </div>

            {/* ACTIONS */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 shrink-0">

              {/* Compteur */}
              <div className="inline-flex items-center justify-center gap-2 rounded-2xl border border-ink-700 bg-ink-800 px-4 py-3 text-sm font-semibold text-ink-950">
                <Swords
                  size={16}
                  className="text-charo-orange"
                />

                {counts.in_progress} en cours ·{' '}
                {counts.scheduled} à venir
              </div>

              {/* HISTORIQUE */}
              <Link
                to="/historique"
                className="btn-outline inline-flex items-center justify-center gap-2 px-4 py-3 rounded-2xl shrink-0"
              >
                <History size={17} />
                <span>Historique des matchs</span>
              </Link>

            </div>

          </div>
        </div>

        {/* FILTRES */}
        <div className="match-filter-bar">
          {filters.map(
            ({ key, label, icon: Icon }) => (
              <button
                key={key}
                type="button"
                onClick={() => setFilter(key)}
                className={`match-filter ${
                  filter === key ? 'is-active' : ''
                }`}
              >
                <Icon size={15} />

                <span>{label}</span>

                <span className="match-filter-count">
                  {counts[key]}
                </span>
              </button>
            )
          )}
        </div>

        {/* CHARGEMENT */}
        {loading && (
          <div className="text-center py-16 text-ink-600 flex items-center justify-center gap-2">
            <LoaderCircle
              size={18}
              className="animate-spin"
            />

            Chargement des matchs...
          </div>
        )}

        {/* ERREUR */}
        {error && !loading && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-700">
            {error}
          </div>
        )}

        {/* MATCHS */}
        {!loading && !error && (
          <div className="space-y-12">

            {['in_progress', 'scheduled'].map(
              (status) => {
                const sectionMatches =
                  visible.filter(
                    (match) =>
                      match.status === status
                  )

                const meta =
                  sectionMeta(status)

                const Icon = meta.icon

                return (
                  <section key={status}>

                    {/* TITRE SECTION */}
                    <div className="flex items-end justify-between gap-4 mb-5">

                      <div>
                        <div className="flex items-center gap-2">

                          <span
                            className={`match-section-icon ${
                              status === 'in_progress'
                                ? 'in-progress'
                                : 'scheduled'
                            }`}
                          >
                            <Icon size={16} />
                          </span>

                          <h2 className="font-display text-2xl md:text-3xl">
                            {meta.title}
                          </h2>

                        </div>

                        <p className="text-sm text-ink-600 mt-1">
                          {meta.subtitle}
                        </p>
                      </div>

                      <span className="text-xs font-bold rounded-full bg-ink-800 border border-ink-700 px-3 py-1.5">
                        {sectionMatches.length}
                      </span>

                    </div>

                    {/* CARTES */}
                    {sectionMatches.length > 0 ? (

                      <div className="grid gap-6 md:grid-cols-2">

                        {sectionMatches.map(
                          (match) => {

                            const type =
                              typeMeta[
                                match.match_type
                              ] || {
                                label:
                                  match.match_type ||
                                  'Match',
                                detail: '',
                              }

                            return (
                              <article
                                key={match.id}
                                className={`
                                  relative overflow-hidden
                                  rounded-2xl
                                  border border-ink-700
                                  bg-white
                                  p-6
                                  shadow-card
                                  transition-all
                                  hover:-translate-y-0.5
                                  hover:border-charo-orange/50
                                  ${
                                    status ===
                                    'in_progress'
                                      ? 'ring-1 ring-live/15'
                                      : ''
                                  }
                                `}
                              >

                                {/* BARRE EN COURS */}
                                {status ===
                                  'in_progress' && (
                                  <div className="absolute inset-x-0 top-0 h-0.5 bg-live animate-pulse" />
                                )}

                                {/* HEADER CARTE */}
                                <div className="flex items-center justify-between mb-6 gap-4">

                                  <div>
                                    <span className="text-xs font-bold uppercase tracking-[0.16em] text-charo-orange">
                                      {match.phase ||
                                        'Match'}
                                    </span>

                                    <p className="text-sm text-ink-600 mt-1">
                                      {match.round_label ||
                                        'Rencontre'}
                                    </p>
                                  </div>

                                  <span
                                    className={`
                                      text-xs font-extrabold
                                      tracking-wide
                                      rounded-full
                                      px-3 py-1.5
                                      ${
                                        status ===
                                        'in_progress'
                                          ? 'badge-in-progress'
                                          : 'border border-ink-700 bg-ink-800 text-white'
                                      }
                                    `}
                                  >
                                    {meta.badge}
                                  </span>

                                </div>

                                {/* JOUEURS */}
                                <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 py-3">

                                  <div className="min-w-0">
                                    <p className="font-display text-lg md:text-xl break-words">
                                      {match.player1
                                        ?.pseudo ||
                                        'À déterminer'}
                                    </p>
                                  </div>

                                  <span className="text-xs font-extrabold text-ink-600">
                                    VS
                                  </span>

                                  <div className="min-w-0 text-right">
                                    <p className="font-display text-lg md:text-xl break-words">
                                      {match.player2
                                        ?.pseudo ||
                                        'À déterminer'}
                                    </p>
                                  </div>

                                </div>

                                {/* INFOS */}
                                <div className="mt-6 pt-4 border-t border-ink-700 flex flex-wrap items-center justify-between gap-3">

                                  <span className="inline-flex items-center gap-2 rounded-full bg-ink-800 border border-ink-700 px-3 py-1.5 text-xs font-bold text-white">

                                    <Swords
                                      size={13}
                                      className="text-charo-orange"
                                    />

                                    {type.label}
                                    {type.detail
                                      ? ` · ${type.detail}`
                                      : ''}
                                  </span>

                                  <span className="text-xs font-semibold text-ink-600">
                                    🕐{' '}
                                    {formatDate(
                                      match.scheduled_at
                                    )}
                                  </span>

                                </div>

                                {/* SCORE EN COURS */}
                                {status ===
                                  'in_progress' &&
                                  (match.score1 !==
                                    null ||
                                    match.score2 !==
                                      null) && (
                                    <div className="mt-4 rounded-xl bg-ink-800 border border-ink-700 px-4 py-3 text-center text-sm font-bold text-white">
                                      Score en cours :{' '}
                                      {match.score1 ??
                                        0}{' '}
                                      —{' '}
                                      {match.score2 ??
                                        0}
                                    </div>
                                  )}

                              </article>
                            )
                          }
                        )}

                      </div>

                    ) : (

                      /* ÉTAT VIDE */
                      <div className="rounded-2xl border border-ink-700 bg-ink-800 p-8 md:p-10 text-center">

                        <div className="mx-auto w-11 h-11 rounded-xl bg-white border border-ink-700 flex items-center justify-center text-charo-orange mb-3">
                          {status ===
                          'in_progress' ? (
                            <Radio size={19} />
                          ) : (
                            <Clock3 size={19} />
                          )}
                        </div>

                        <h3 className="font-bold text-lg text-white">
                          {status ===
                          'in_progress'
                            ? 'Aucun match en cours'
                            : 'Aucun match à venir'}
                        </h3>

                        <p className="text-sm text-ink-600 mt-1.5">
                          {status ===
                          'in_progress'
                            ? 'Les combats apparaîtront ici dès qu’ils commenceront.'
                            : 'Les prochaines rencontres apparaîtront ici dès qu’elles seront programmées.'}
                        </p>

                      </div>
                    )}

                  </section>
                )
              }
            )}

          </div>
        )}

      </main>

      <Footer />
    </div>
  )
}