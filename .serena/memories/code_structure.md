# Code Structure

## Root
- `POS_Project/`: Main application source code.
- `POS_Project/backend/`: Node.js/Express server.
- `POS_Project/frontend/`: React/Vite application.

## Backend (`POS_Project/backend/src/`)
- `database/`: Schema migrations, seed data, and DB connection helpers.
- `middleware/`: Auth, error handling, and rate limiting.
- `routes/`: API endpoint definitions (auth, products, orders, inventory, etc.).
- `server.js`: Entry point for the backend.

## Frontend (`POS_Project/frontend/src/`)
- `components/`: Reusable UI components and layouts.
- `contexts/`: React context providers (Auth, Cart, etc.).
- `pages/`: Page-level components (POS, Dashboard, Inventory).
- `services/`: API communication, IndexedDB helpers, and sync logic.
- `utils/`: Helper functions (formatting, validation).
- `App.jsx`: Main application component and routing.
- `main.jsx`: Application entry point.
