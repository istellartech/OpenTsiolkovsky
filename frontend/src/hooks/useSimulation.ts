import { useState, useCallback, useMemo, useRef } from 'react'
import type React from 'react'
import type { ClientConfig, SimulationState } from '../lib/simulation'
import { runSimulation } from '../lib/simulation'
import { createDefaultConfig } from '../config/defaults'
import { validateConfig, isValidClientConfig, type ValidationIssue } from '../utils/validation'

export function useSimulation(onResult: (trajectory: SimulationState[], config: ClientConfig, executionTime: number) => void) {
  const [config, setConfig] = useState<ClientConfig>(() => createDefaultConfig())
  const [useCnProfile, setUseCnProfile] = useState(() => config.aerodynamics.cn_profile.length > 0)
  const [useCaProfile, setUseCaProfile] = useState(() => config.aerodynamics.ca_profile.length > 0)
  const [useAttitudeProfile, setUseAttitudeProfile] = useState(() => config.attitude.profile.length > 0)
  const [useWindProfile, setUseWindProfile] = useState(() => config.wind.profile.length > 0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isCompleted, setIsCompleted] = useState(false)
  const [executionTime, setExecutionTime] = useState<number | null>(null)
  const [showVariations, setShowVariations] = useState(false)
  const [selectedPresetId, setSelectedPresetId] = useState<string>('sample')
  const [openStageIds, setOpenStageIds] = useState<string[]>(['stage-0'])
  const [showTemplates, setShowTemplates] = useState(false)

  const jsonPreview = useMemo(() => JSON.stringify(config, null, 2), [config])
  const validationIssues = useMemo(() => validateConfig(config), [config])
  const hasValidationIssues = validationIssues.length > 0
  const issuesSet = useMemo(() => new Set(validationIssues.map((issue) => issue.field)), [validationIssues])

  const fieldRefs = useRef<Record<string, HTMLElement | null>>({})

  const makeFieldRef = useCallback(
    (field?: string) => (el: HTMLElement | null) => {
      if (!field) return
      if (el) {
        fieldRefs.current[field] = el
      } else {
        delete fieldRefs.current[field]
      }
    },
    [],
  )

  const handleRunSimulation = useCallback(async () => {
    if (hasValidationIssues) return

    setLoading(true)
    setError(null)
    setIsCompleted(false)
    setExecutionTime(null)

    const startTime = performance.now()

    try {
      const result = await runSimulation(config)
      const endTime = performance.now()
      const duration = Math.round(endTime - startTime)

      setExecutionTime(duration)
      setIsCompleted(true)
      onResult(result, config, duration)
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown simulation error occurred'
      setError(errorMessage)
      setIsCompleted(false)
      setExecutionTime(null)
    } finally {
      setLoading(false)
    }
  }, [config, hasValidationIssues, onResult])

  const handlePresetChange = useCallback((presetId: string, presetCreate: () => ClientConfig) => {
    if (presetId === selectedPresetId) return

    setSelectedPresetId(presetId)
    const newConfig = presetCreate()
    setConfig(newConfig)
    setUseCnProfile(newConfig.aerodynamics.cn_profile.length > 0)
    setUseCaProfile(newConfig.aerodynamics.ca_profile.length > 0)
    setUseAttitudeProfile(newConfig.attitude.profile.length > 0)
    setUseWindProfile(newConfig.wind.profile.length > 0)
    setOpenStageIds(['stage-0'])
    setShowVariations(false)
  }, [selectedPresetId])

  const scrollToFirstError = useCallback(() => {
    if (validationIssues.length === 0) return

    const firstIssue = validationIssues[0]
    const element = fieldRefs.current[firstIssue.field]

    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' })
      element.focus?.()
    }
  }, [validationIssues])

  const handleImportConfig = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const content = e.target?.result as string
        const importedConfig = JSON.parse(content)

        // Validate structure before setting config
        if (!isValidClientConfig(importedConfig)) {
          setError('設定ファイルの構造が不正です。必須フィールド（simulation, launch, aerodynamics, attitude, wind）が不足している可能性があります。')
          return
        }

        // If structure is valid, apply the config
        setConfig(importedConfig)
        setUseCnProfile(importedConfig.aerodynamics?.cn_profile?.length > 0 || false)
        setUseCaProfile(importedConfig.aerodynamics?.ca_profile?.length > 0 || false)
        setUseAttitudeProfile(importedConfig.attitude?.profile?.length > 0 || false)
        setUseWindProfile(importedConfig.wind?.profile?.length > 0 || false)
        setSelectedPresetId('custom')
        setShowTemplates(false)
        setError(null) // Clear any previous errors
      } catch (error) {
        setError('設定ファイルの読み込みに失敗しました。JSONフォーマットが正しくない可能性があります。')
      }
    }
    reader.readAsText(file)

    // Reset file input
    event.target.value = ''
  }, [])

  const handleExportConfig = useCallback(() => {
    const dataStr = JSON.stringify(config, null, 2)
    const dataBlob = new Blob([dataStr], { type: 'application/json' })
    const url = URL.createObjectURL(dataBlob)

    const link = document.createElement('a')
    link.href = url
    link.download = `${config.name || 'rocket-config'}-${new Date().toISOString().split('T')[0]}.json`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)

    URL.revokeObjectURL(url)
  }, [config])

  return {
    // State
    config,
    setConfig,
    useCnProfile,
    setUseCnProfile,
    useCaProfile,
    setUseCaProfile,
    useAttitudeProfile,
    setUseAttitudeProfile,
    useWindProfile,
    setUseWindProfile,
    loading,
    error,
    isCompleted,
    executionTime,
    showVariations,
    setShowVariations,
    selectedPresetId,
    openStageIds,
    setOpenStageIds,
    showTemplates,
    setShowTemplates,

    // Computed
    jsonPreview,
    validationIssues,
    hasValidationIssues,
    issuesSet,

    // Methods
    handleRunSimulation,
    handlePresetChange,
    handleImportConfig,
    handleExportConfig,
    makeFieldRef,
    scrollToFirstError,
  }
}