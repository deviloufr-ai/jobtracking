export default function InterviewHistory({ jobs }) {
  const allSessions = jobs
    .flatMap((job) =>
      (job.interviewSessions || []).map((session) => ({
        ...session,
        company: job.company,
        position: job.position,
        jobId: job.id
      }))
    )
    .sort((a, b) => new Date(b.date) - new Date(a.date))

  const avgScore =
    allSessions.length > 0
      ? (
          allSessions.reduce((sum, s) => sum + (s.score || 0), 0) /
          allSessions.length
        ).toFixed(1)
      : '—'

  const passCount = allSessions.filter(
    (s) => s.hire_decision === 'Yes'
  ).length
  const concernCount = allSessions.filter(
    (s) => s.hire_decision === 'No'
  ).length

  if (allSessions.length === 0) {
    return (
      <div className="p-6 text-center">
        <p className="text-gray-500">No interviews yet.</p>
        <p className="text-sm text-gray-400 mt-2">
          Start a mock interview from any job to see results here.
        </p>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
          <p className="text-xs text-gray-600 mb-1">Total Interviews</p>
          <p className="text-3xl font-bold text-purple-600">{allSessions.length}</p>
        </div>
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <p className="text-xs text-gray-600 mb-1">Average Score</p>
          <p className="text-3xl font-bold text-blue-600">{avgScore}</p>
        </div>
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <p className="text-xs text-gray-600 mb-1">Ready to Move Forward</p>
          <p className="text-3xl font-bold text-green-600">{passCount}</p>
        </div>
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-xs text-gray-600 mb-1">Not Ready Yet</p>
          <p className="text-3xl font-bold text-red-600">{concernCount}</p>
        </div>
      </div>

      {/* Recent interviews */}
      <div>
        <h3 className="text-lg font-bold text-gray-800 mb-3">Recent Practice Sessions</h3>
        <div className="space-y-3">
          {allSessions.map((session, idx) => (
            <div key={idx} className="bg-white border border-gray-200 rounded-lg p-4">
              <div className="flex justify-between items-start mb-2">
                <div>
                  <p className="font-semibold text-gray-800">
                    {session.position} @ {session.company}
                  </p>
                  <p className="text-xs text-gray-500">
                    {new Date(session.date).toLocaleDateString()} •{' '}
                    {new Date(session.date).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                  </p>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-bold text-purple-600">
                    {session.score}
                  </div>
                  <p
                    className={`text-xs font-bold ${
                      session.hire_decision === 'Yes'
                        ? 'text-green-700'
                        : session.hire_decision === 'No'
                          ? 'text-red-700'
                          : 'text-orange-700'
                    }`}
                  >
                    {session.hire_decision === 'Yes'
                      ? '✅ Move Forward'
                      : session.hire_decision === 'No'
                        ? '❌ Not Ready'
                        : '⏳ On The Fence'}
                  </p>
                </div>
              </div>

              {/* Strengths */}
              {session.feedback?.strengths && (
                <div className="mb-2">
                  <p className="text-xs font-bold text-green-700 mb-1">What Impressed</p>
                  <ul className="text-xs text-gray-700 space-y-0.5">
                    {Array.isArray(session.feedback.strengths) ? (
                      session.feedback.strengths.map((s, i) => (
                        <li key={i}>• {s}</li>
                      ))
                    ) : (
                      <li>• {session.feedback.strengths}</li>
                    )}
                  </ul>
                </div>
              )}

              {/* Concerns */}
              {session.feedback?.concerns && (
                <div>
                  <p className="text-xs font-bold text-red-700 mb-1">Concerns</p>
                  <ul className="text-xs text-gray-700 space-y-0.5">
                    {Array.isArray(session.feedback.concerns) ? (
                      session.feedback.concerns.map((c, i) => (
                        <li key={i}>• {c}</li>
                      ))
                    ) : (
                      <li>• {session.feedback.concerns}</li>
                    )}
                  </ul>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Progress note */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <p className="text-xs text-blue-700">
          💡 <strong>Tip:</strong> Take multiple interviews for the same position to track your improvement. Your scores should trend upward as you practice!
        </p>
      </div>
    </div>
  )
}
