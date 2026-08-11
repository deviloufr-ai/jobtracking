import { renderCV, BASE_PRINT_CSS } from './CVGenerator'

export default function CVViewer({ job, onClose, inline = false }) {
  if (!job?.cvSaved) return null

  const { markdown, template, filename } = job.cvSaved
  const html = renderCV(markdown, template, null)

  const handleDownloadPDF = async () => {
    try {
      const { default: html2pdf } = await import('html2pdf.js')
      const element = document.createElement('div')
      element.innerHTML = html
      element.style.padding = '0'
      element.style.margin = '0'
      element.style.fontFamily = 'Arial, Helvetica, sans-serif'
      element.style.lineHeight = '1.2'
      element.style.color = '#000'
      element.style.backgroundColor = '#fff'
      element.style.width = '210mm'
      element.style.boxSizing = 'border-box'
      element.style.wordWrap = 'break-word'
      element.style.overflowWrap = 'break-word'

      const opt = {
        margin: [12, 0, 14, 0],
        filename: `${filename}.pdf`,
        image: { type: 'jpeg', quality: 0.92 },
        html2canvas: {
          scale: 2,
          useCORS: true,
          allowTaint: true,
          backgroundColor: '#ffffff',
          logging: false,
        },
        jsPDF: {
          unit: 'mm',
          format: 'a4',
          orientation: 'portrait',
          compress: true,
          hotfixes: ['px_scaling'],
        },
        pagebreak: {
          mode: ['css', 'legacy'],
          avoid: '.cv-block',
        },
      }

      await html2pdf().set(opt).from(element).save()
    } catch (err) {
      console.error('PDF download error:', err)
    }
  }

  // Inline mode — render the CV content directly inside its container (no modal overlay)
  if (inline) {
    return (
      <div className="flex flex-col h-full">
        {/* Toolbar */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-200 flex-shrink-0 bg-white">
          <span className="text-sm font-semibold text-gray-700 truncate">📄 {filename}</span>
          <button
            onClick={handleDownloadPDF}
            className="text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 px-3 py-1.5 rounded-lg transition-colors flex-shrink-0"
          >
            📥 Télécharger PDF
          </button>
        </div>

        {/* CV Content */}
        <div className="flex-1 overflow-auto bg-gray-50 p-6">
          <div
            className="cv-paper rounded-lg shadow-sm p-8 max-w-2xl mx-auto"
            dangerouslySetInnerHTML={{ __html: html }}
          />
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-2 sm:p-4">
      <div className="bg-white rounded-lg shadow-2xl w-full max-w-4xl max-h-[94vh] sm:max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between gap-2 p-3 sm:p-4 border-b border-gray-200 flex-shrink-0">
          <h2 className="text-base sm:text-lg font-bold text-gray-800 truncate min-w-0">📄 {filename}</h2>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={handleDownloadPDF}
              className="text-xs sm:text-sm text-white bg-indigo-600 hover:bg-indigo-700 px-3 sm:px-4 py-2 rounded-lg transition-colors whitespace-nowrap"
            >
              📥 <span className="hidden sm:inline">Télécharger </span>PDF
            </button>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 text-2xl leading-none px-1"
              aria-label="Close"
            >
              ✕
            </button>
          </div>
        </div>

        {/* CV Content */}
        <div className="flex-1 overflow-auto bg-gray-50 p-3 sm:p-6">
          <div
            className="cv-paper rounded-lg shadow-sm p-4 sm:p-8 max-w-2xl mx-auto"
            dangerouslySetInnerHTML={{ __html: html }}
          />
        </div>
      </div>
    </div>
  )
}
