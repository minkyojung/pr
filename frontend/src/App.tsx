/**
 * Main App Component
 */

import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';
import { Timeline } from './components/Timeline';
import { Search } from './components/Search';
import { ObjectDetail } from './components/ObjectDetail';
import './App.css';

function App() {
  return (
    <BrowserRouter>
      <div className="app">
        <nav className="app-nav">
          <div className="nav-container">
            <Link to="/" className="nav-logo">
              📊 Belo Timeline
            </Link>
            <div className="nav-links">
              <Link to="/" className="nav-link">
                Timeline
              </Link>
              <Link to="/search" className="nav-link">
                Search
              </Link>
            </div>
          </div>
        </nav>

        <main className="app-main">
          <Routes>
            <Route path="/" element={<Timeline />} />
            <Route path="/search" element={<Search />} />
            <Route path="/object/:id" element={<ObjectDetail />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}

export default App;
