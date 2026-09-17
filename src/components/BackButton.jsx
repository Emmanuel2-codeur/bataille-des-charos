import { ArrowLeft } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

export default function BackButton({ className = '' }) {
  const navigate = useNavigate()
  return <button type="button" onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/'))} className={`back-button ${className}`} aria-label="Retour à la page précédente" title="Retour"><ArrowLeft size={16} strokeWidth={2.5}/><span>Retour</span></button>
}
