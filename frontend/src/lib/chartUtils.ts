import type { Chart } from 'chart.js'
import JSZip from 'jszip'

/**
 * Downloads a chart as a PNG image
 * @param chart - Chart.js chart instance
 * @param filename - Optional filename (without extension)
 */
export function downloadChartAsImage(chart: Chart, filename?: string): void {
  if (!chart || !chart.canvas) {
    console.error('Invalid chart instance or canvas not available')
    return
  }

  try {
    // Get the canvas from the chart
    const canvas = chart.canvas

    // Convert canvas to blob
    canvas.toBlob((blob) => {
      if (!blob) {
        console.error('Failed to create blob from canvas')
        return
      }

      // Create download link
      const link = document.createElement('a')
      const url = URL.createObjectURL(blob)

      // Generate filename with timestamp
      const timestamp = new Date().toISOString().split('T')[0]
      const defaultFilename = `chart-${timestamp}`
      const finalFilename = `${filename || defaultFilename}.png`

      link.href = url
      link.download = finalFilename

      // Trigger download
      document.body.appendChild(link)
      link.click()

      // Cleanup
      document.body.removeChild(link)
      URL.revokeObjectURL(url)
    }, 'image/png')
  } catch (error) {
    console.error('Error downloading chart:', error)
  }
}

/**
 * Gets a chart type name for filename generation
 * @param chartTitle - The title or label of the chart
 * @returns A sanitized filename-safe string
 */
export function getChartFilename(chartTitle: string): string {
  return chartTitle
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

/**
 * Downloads multiple charts as a ZIP file
 * @param charts - Array of chart instances with titles
 * @param rocketName - Name of the rocket for filename
 */
export async function downloadAllChartsAsZip(
  charts: Array<{ chart: Chart; title: string }>,
  rocketName?: string
): Promise<void> {
  try {
    const zip = new JSZip()

    // Create timestamp for filename
    const now = new Date()
    const dateStr = now.toISOString().split('T')[0] // YYYY-MM-DD
    const timeStr = now.toTimeString().split(' ')[0].replace(/:/g, '-') // HH-MM-SS

    // Create sanitized rocket name
    const sanitizedRocketName = rocketName
      ? rocketName.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')
      : 'rocket'

    // Generate ZIP filename
    const zipFilename = `${sanitizedRocketName}-graphs-${dateStr}-${timeStr}.zip`

    // Process each chart
    const promises = charts.map(({ chart, title }) => {
      return new Promise<void>((resolve, reject) => {
        if (!chart || !chart.canvas) {
          console.warn(`Skipping chart "${title}": Invalid chart instance`)
          resolve()
          return
        }

        const filename = `${getChartFilename(title)}.png`

        chart.canvas.toBlob((blob) => {
          if (!blob) {
            console.warn(`Failed to create blob for chart "${title}"`)
            resolve()
            return
          }

          zip.file(filename, blob)
          resolve()
        }, 'image/png')
      })
    })

    // Wait for all charts to be processed
    await Promise.all(promises)

    // Generate and download ZIP
    const content = await zip.generateAsync({ type: 'blob' })

    // Create download link
    const link = document.createElement('a')
    const url = URL.createObjectURL(content)

    link.href = url
    link.download = zipFilename

    // Trigger download
    document.body.appendChild(link)
    link.click()

    // Cleanup
    document.body.removeChild(link)
    URL.revokeObjectURL(url)

  } catch (error) {
    console.error('Error creating ZIP file:', error)
  }
}