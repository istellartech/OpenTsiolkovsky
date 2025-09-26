import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Tabs, TabsContent, TabsList, TabsTrigger, Badge } from './ui'
import { SwitchField } from './shared'
import { useSimulation } from '../hooks/useSimulation'
import { PRESET_OPTIONS } from '../config/defaults'
import { VALIDATION_ERROR_MESSAGE } from '../utils/validation'
import { LaunchForm } from './forms/LaunchForm'
import { StageForm } from './forms/StageForm'
import { AerodynamicsForm } from './forms/AerodynamicsForm'
import { WindForm } from './forms/WindForm'
import type { ClientConfig, SimulationState } from '../lib/simulation'

interface Props {
  onResult: (trajectory: SimulationState[], config: ClientConfig) => void
}

export function SimulationPanel({ onResult }: Props) {
  const {
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
    showVariations,
    setShowVariations,
    selectedPresetId,
    openStageIds,
    setOpenStageIds,
    showTemplates,
    setShowTemplates,
    jsonPreview,
    validationIssues,
    hasValidationIssues,
    issuesSet,
    handleRunSimulation,
    handlePresetChange,
    handleImportConfig,
    handleExportConfig,
    makeFieldRef,
    scrollToFirstError,
  } = useSimulation(onResult)

  return (
    <Card className="panel-card">
      <CardHeader className="border-b border-slate-200/80 bg-white/60">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>シミュレーション設定</CardTitle>
            <CardDescription>ロケットシミュレーションのパラメータを設定し、解析を実行。</CardDescription>
          </div>
          <SwitchField
            id="global-show-variations"
            label="変動値を表示"
            checked={showVariations}
            onCheckedChange={setShowVariations}
          />
        </div>
      </CardHeader>
      <CardContent>
        {/* Import/Export Actions */}
        <div className="mb-6 flex flex-wrap items-center gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={() => document.getElementById('config-import')?.click()}
            className="flex items-center gap-2"
          >
            📁 JSON読み込み
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={handleExportConfig}
            className="flex items-center gap-2"
          >
            💾 JSON書き出し
          </Button>
          <div className="ml-auto">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setShowTemplates(!showTemplates)}
              className="text-xs text-slate-500"
            >
              {showTemplates ? '非表示' : '表示'} クイックスタートテンプレート
            </Button>
          </div>
          <input
            id="config-import"
            type="file"
            accept=".json"
            className="hidden"
            onChange={handleImportConfig}
          />
        </div>

        {/* Quick Start Templates - Collapsible */}
        {showTemplates && (
          <div className="mb-6 rounded-lg border border-slate-200 bg-slate-50/50 p-4">
            <h4 className="mb-3 text-sm font-medium text-slate-700">クイックスタートテンプレート</h4>
            <div className="grid gap-2 sm:grid-cols-3">
              {PRESET_OPTIONS.map((preset) => (
                <Button
                  key={preset.id}
                  type="button"
                  variant={selectedPresetId === preset.id ? 'default' : 'outline'}
                  onClick={() => handlePresetChange(preset.id, preset.create)}
                  size="sm"
                  className="h-auto flex-col items-start gap-1 p-2 text-left"
                >
                  <div className="text-xs font-medium">{preset.label}</div>
                  <div className="text-xs opacity-70">{preset.description}</div>
                </Button>
              ))}
            </div>
          </div>
        )}

        <Tabs defaultValue="basic" className="w-full">
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="basic">打ち上げ</TabsTrigger>
            <TabsTrigger value="stages">ステージ</TabsTrigger>
            <TabsTrigger value="aerodynamics">空力</TabsTrigger>
            <TabsTrigger value="wind">風</TabsTrigger>
            <TabsTrigger value="preview">プレビュー</TabsTrigger>
          </TabsList>

          <TabsContent value="basic" className="mt-6">
            <LaunchForm
              config={config}
              setConfig={setConfig}
              showVariations={showVariations}
              issuesSet={issuesSet}
              makeFieldRef={makeFieldRef}
            />
          </TabsContent>

          <TabsContent value="stages" className="mt-6">
            <StageForm
              config={config}
              setConfig={setConfig}
              issuesSet={issuesSet}
              makeFieldRef={makeFieldRef}
              openStageIds={openStageIds}
              setOpenStageIds={setOpenStageIds}
              showVariations={showVariations}
              setShowVariations={setShowVariations}
            />
          </TabsContent>

          <TabsContent value="aerodynamics" className="mt-6">
            <AerodynamicsForm
              config={config}
              setConfig={setConfig}
              useCnProfile={useCnProfile}
              setUseCnProfile={setUseCnProfile}
              useCaProfile={useCaProfile}
              setUseCaProfile={setUseCaProfile}
              showVariations={showVariations}
              issuesSet={issuesSet}
              makeFieldRef={makeFieldRef}
            />
          </TabsContent>

          <TabsContent value="wind" className="mt-6">
            <WindForm
              config={config}
              setConfig={setConfig}
              useAttitudeProfile={useAttitudeProfile}
              setUseAttitudeProfile={setUseAttitudeProfile}
              useWindProfile={useWindProfile}
              setUseWindProfile={setUseWindProfile}
              showVariations={showVariations}
              issuesSet={issuesSet}
              makeFieldRef={makeFieldRef}
            />
          </TabsContent>

          <TabsContent value="preview" className="mt-6">
            <div className="space-y-4">
              <div className="rounded-lg border border-slate-300 bg-slate-900 p-4">
                <div className="mb-3 flex items-center gap-2">
                  <div className="text-sm font-medium text-slate-100">設定JSON</div>
                  <Badge variant="secondary" className="text-xs">プレビュー</Badge>
                </div>
                <div className="max-h-96 overflow-auto rounded border border-slate-700 bg-slate-950 p-3">
                  <pre className="font-mono text-xs text-green-400 leading-relaxed">
                    {jsonPreview}
                  </pre>
                </div>
              </div>
            </div>
          </TabsContent>

          <div className="mt-6 space-y-4">
            {/* Validation Issues */}
            {hasValidationIssues && (
              <div className="space-y-3 rounded-lg border border-rose-200 bg-rose-50 p-4">
                <div className="flex items-start gap-3">
                  <Badge variant="destructive">問題が見つかりました</Badge>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-rose-800">{VALIDATION_ERROR_MESSAGE}</p>
                    <ul className="mt-2 space-y-1 text-xs text-rose-700">
                      {validationIssues.slice(0, 5).map((issue, idx) => (
                        <li key={idx}>• {issue.message}</li>
                      ))}
                      {validationIssues.length > 5 && (
                        <li className="font-medium">... and {validationIssues.length - 5} more issues</li>
                      )}
                    </ul>
                  </div>
                </div>
                <Button type="button" size="sm" variant="outline" onClick={scrollToFirstError}>
                  最初の問題に移動
                </Button>
              </div>
            )}

            {/* Error Display */}
            {error && (
              <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
                <strong>シミュレーションエラー:</strong> {error}
              </div>
            )}

            {/* Run Button */}
            <Button
              onClick={handleRunSimulation}
              disabled={loading || hasValidationIssues}
              className="w-full"
              size="lg"
            >
              {loading ? 'シミュレーション実行中...' : 'シミュレーション実行'}
            </Button>
          </div>
        </Tabs>
      </CardContent>
    </Card>
  )
}