/**
 * The Forecast view's model for the page: one model per analytics context (`forecastModel`,
 * cached), shared by every tab and the homes that re-link its tiles.
 */
import { useMemo } from 'react'
import { useAnalytics } from '@/data/context'
import { type ForecastModel, forecastModel } from '../engine'

export function useForecast(): ForecastModel {
  const ctx = useAnalytics()
  return useMemo(() => forecastModel(ctx), [ctx])
}
