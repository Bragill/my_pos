# Tech Stack

## Frontend
- **Framework**: React 18
- **Build Tool**: Vite
- **Styling**: Tailwind CSS
- **PWA**: `vite-plugin-pwa`
- **Icons**: Heroicons
- **Charts**: Recharts
- **Offline Storage**: IndexedDB (via `idb` library)
- **Networking**: Axios
- **HTTPS**: Local HTTPS via `mkcert`

## Backend
- **Runtime**: Node.js
- **Framework**: Express
- **Security**: Helmet, Express Rate Limit, BcryptJS, JWT
- **CORS**: Enabled for frontend communication

## Database
- **Engine**: SQLite (using `sql.js` library)
- **Persistence**: File-based (`pos_system.db`) with auto-save and sync to file system.
- **Helpers**: Custom `dbHelper.js` and `connection.js` for SQL execution and persistence.
