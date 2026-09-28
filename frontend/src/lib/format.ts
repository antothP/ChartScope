import { TickMarkType, type Time } from 'lightweight-charts'

// 2 décimales pour un indice (~25000), 5 pour une paire forex (~1.14)
export const precisionFor = (price: number) => (price < 10 ? 5 : 2)

export const formatPrice = (price: number, precision = precisionFor(price)) =>
  price.toLocaleString('fr-FR', { minimumFractionDigits: precision, maximumFractionDigits: precision })

export const formatDateTime = (iso: string) =>
  new Date(iso).toLocaleString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })

// le graphique reçoit des secondes Unix : on les affiche en heure locale (comme la liste), pas en UTC
const fromChartTime = (time: Time) => new Date((time as number) * 1000)

export const chartTimeFormatter = (time: Time) =>
  fromChartTime(time).toLocaleString('fr-FR', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })

export const chartTickFormatter = (time: Time, type: TickMarkType) => {
  const d = fromChartTime(time)
  switch (type) {
    case TickMarkType.Year:
      return String(d.getFullYear())
    case TickMarkType.Month:
      return d.toLocaleString('fr-FR', { month: 'short' })
    case TickMarkType.DayOfMonth:
      return String(d.getDate())
    default:
      return d.toLocaleString('fr-FR', { hour: '2-digit', minute: '2-digit' })
  }
}
