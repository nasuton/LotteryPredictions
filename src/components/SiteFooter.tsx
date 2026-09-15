import { footerLinks } from '../config/site'
import './SiteFooter.css'

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="technology-stack">
        <p><strong>フロントエンド：</strong>React + Vite + GitHub Pages</p>
        <p><strong>バックエンド：</strong>Go言語（Ginフレームワーク） + MySQL + Apache</p>
      </div>
      <nav className="footer-navigation" aria-labelledby="footer-links-heading">
        <h2 id="footer-links-heading">各種リンク</h2>
        <ul className="footer-links">
          {footerLinks.map((link) => (
            <li key={link.label}>
              {link.url ? (
                <a href={link.url} target="_blank" rel="noopener noreferrer">
                  {link.label}
                </a>
              ) : (
                <span className="footer-link-pending">{link.label}（準備中）</span>
              )}
            </li>
          ))}
        </ul>
      </nav>
    </footer>
  )
}
