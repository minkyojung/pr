import Link from "next/link";

export default function Home() {
  return (
    <div className="min-h-screen p-8 flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800">
      <main className="max-w-4xl mx-auto text-center">
        <h1 className="text-6xl font-bold mb-6 bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
          Daily Brag Doc Generator
        </h1>
        <p className="text-xl text-gray-700 dark:text-gray-300 mb-8">
          Automatically track your GitHub achievements and generate professional brag documents
        </p>

        <div className="flex gap-4 justify-center mb-12">
          <Link
            href="/dashboard"
            className="px-8 py-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-semibold text-lg shadow-lg"
          >
            🚀 Go to Dashboard
          </Link>
        </div>

        <div className="grid md:grid-cols-3 gap-6 mt-16">
          <div className="p-6 bg-white dark:bg-gray-800 rounded-lg shadow-md">
            <div className="text-4xl mb-4">📊</div>
            <h3 className="text-xl font-semibold mb-2">Auto-Track</h3>
            <p className="text-gray-600 dark:text-gray-400">
              Automatically collect your GitHub activity (commits, PRs, issues)
            </p>
          </div>

          <div className="p-6 bg-white dark:bg-gray-800 rounded-lg shadow-md">
            <div className="text-4xl mb-4">✨</div>
            <h3 className="text-xl font-semibold mb-2">Generate Docs</h3>
            <p className="text-gray-600 dark:text-gray-400">
              Transform raw activity into structured achievement documents
            </p>
          </div>

          <div className="p-6 bg-white dark:bg-gray-800 rounded-lg shadow-md">
            <div className="text-4xl mb-4">🎯</div>
            <h3 className="text-xl font-semibold mb-2">Track Impact</h3>
            <p className="text-gray-600 dark:text-gray-400">
              Analyze your work patterns and identify high-impact contributions
            </p>
          </div>
        </div>

        <div className="mt-16 p-6 bg-white dark:bg-gray-800 rounded-lg shadow-md text-left">
          <h2 className="text-2xl font-bold mb-4">🎉 Currently Available</h2>
          <ul className="space-y-2 text-gray-700 dark:text-gray-300">
            <li>✅ GitHub ETL (404 events collected)</li>
            <li>✅ Template-based brag doc generation</li>
            <li>✅ Project & category analysis</li>
            <li>✅ High-impact achievement detection</li>
            <li>✅ Dashboard UI</li>
          </ul>
        </div>
      </main>
    </div>
  );
}
