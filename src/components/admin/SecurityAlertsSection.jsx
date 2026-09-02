import { ShieldAlert, CheckCircle2 } from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'

const SEVERITY_STYLE = {
  low: 'bg-ink-800 border-ink-700 text-ink-600',
  medium: 'bg-amber-50 border-amber-200 text-amber-700',
  high: 'bg-orange-50 border-orange-200 text-orange-700',
  critical: 'bg-red-50 border-red-300 text-red-700',
}
const SEVERITY_LABEL = { low: 'Info', medium: 'Attention', high: 'Alerte', critical: 'Critique' }

export default function SecurityAlertsSection({ alerts, onChanged, setMessage, setError }) {
  const resolve = async (id) => {
    const { data: { user } } = await supabase.auth.getUser()
    const { error } = await supabase.from('security_alerts').update({
      resolved: true, resolved_by: user?.id || null, resolved_at: new Date().toISOString(),
    }).eq('id', id)
    if (error) setError(error.message)
    else { setMessage('Alerte marquée comme traitée.'); onChanged() }
  }

  const unresolved = alerts.filter((a) => !a.resolved)
  const resolved = alerts.filter((a) => a.resolved)

  return (
    <div className="mb-14">
      <div className="flex items-center gap-2.5 mb-1"><ShieldAlert size={18} className="text-charo-orange" /><h2 className="font-bold text-lg text-ink-700">Sécurité — réservé au super-admin</h2></div>
      <p className="text-sm text-ink-600 mb-5">
        Détection automatique : rafales d'actions, suppressions en masse, tentative d'élévation de rôle, activité hors-heures.
        Une notification et un email sont envoyés dès qu'une anomalie est détectée.
      </p>

      <div className="card divide-y divide-ink-700 mb-6">
        {unresolved.length === 0 && (
          <p className="p-6 text-sm text-ink-600 flex items-center gap-2"><CheckCircle2 size={16} className="text-green-600" /> Aucune anomalie en attente — tout est calme.</p>
        )}
        {unresolved.map((a) => (
          <div key={a.id} className="p-5 flex flex-wrap items-start gap-4">
            <span className={`text-[10px] font-extrabold uppercase tracking-wide rounded-full px-2.5 py-1 border shrink-0 ${SEVERITY_STYLE[a.severity]}`}>
              {SEVERITY_LABEL[a.severity]}
            </span>
            <div className="min-w-[220px] flex-1">
              <p className="text-sm font-semibold">{a.message}</p>
              <p className="text-[11px] text-ink-600 mt-1">{new Date(a.created_at).toLocaleString('fr-FR')} · type: {a.type}</p>
            </div>
            <button onClick={() => resolve(a.id)} className="btn-outline !px-3 !py-2 text-xs shrink-0">Marquer comme traité</button>
          </div>
        ))}
      </div>

      {resolved.length > 0 && (
        <details className="card p-5">
          <summary className="text-sm font-bold cursor-pointer">Alertes traitées ({resolved.length})</summary>
          <div className="mt-4 space-y-3">
            {resolved.map((a) => (
              <div key={a.id} className="text-xs text-ink-600 flex items-center gap-2">
                <CheckCircle2 size={13} className="text-green-600 shrink-0" />
                {a.message} — traité le {a.resolved_at ? new Date(a.resolved_at).toLocaleString('fr-FR') : '—'}
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  )
}
