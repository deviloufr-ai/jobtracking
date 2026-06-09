import html2pdf from 'html2pdf.js'
import { renderCV, BASE_PRINT_CSS } from './CVGenerator'

export default function CVViewer({ job, onClose }) {
  if (!job?.cvSaved) return null

  const { markdown, template, filename } = job.cvSaved
  const html = renderCV(markdown, template, null)

  const handleDownloadPDF = () => {
    const element = document.createElement('div')
    element.innerHTML = html
    element.style.padding = '20px'
    element.style.fontFamily = 'Arial, Helvetica, sans-serif'
    element.style.lineHeight = '1.5'
    element.style.backgroundColor = '#fff'

    const opt = {
      margin: 10,
      filename: `${filename}.pdf`,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2 },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    }

    html2pdf().set(opt).from(element).save()
  }

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 flex-shrink-0">
          <h2 className="text-lg font-bold text-gray-800">📄 {filename}</h2>
          <div className="flex items-center gap-2">
            <button
              onClick={handleDownloadPDF}
              className="text-sm text-white bg-indigo-600 hover:bg-indigo-700 px-4 py-2 rounded-lg transition-colors"
            >
              📥 Télécharger PDF
            </button>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 text-2xl leading-none"
            >
              ✕
            </button>
          </div>
        </div>

        {/* CV Content */}
        <div className="flex-1 overflow-auto bg-gray-50 p-6">
          <div
            className="bg-white rounded-lg shadow-sm p-8 max-w-2xl mx-auto"
            dangerouslySetInnerHTML={{ __html: html }}
          />
        </div>
      </div>
    </div>
  )
}
