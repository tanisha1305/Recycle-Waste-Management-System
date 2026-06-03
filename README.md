# Recycle Business Manager

A comprehensive material tracking and loss management system for recycling businesses. Track shipments, process materials through 4 stages, and analyze losses at every step.

## Features

### 📦 Sender Portal
- Create and track shipments
- Record material purchases
- Monitor shipment status
- View transport and processing losses
- Track cost implications
- Send

### 📥 Receiver Portalhfgdshdgf
- Receive incoming shipments
- **4-Stage Processing System** (New!)
  - Stage 1: Sorting with quality grading
  - Stage 2: Crushing
  - Stage 3: Washing.
  - Stage 4: Pelleting with product specs.
- Automatic loss calculations at each stage.
- Operator tracking and accountability.
- Cumulative loss analysis.

### 📊 Loss Tracking
- Transport loss calculation
- Per-stage processing loss
- Cumulative loss tracking (weight, %, cost)
- Effective cost per KG analysis
- Historical loss data

### 🎨 Modern UI
- Material Design inspired interface
- Gradient feature cards
- Stage progress visualization
- Responsive layout
- Clean, professional look

## 4-Stage Processing System

The receiver can now track material through 4 distinct processing stages:

1. **🔍 Sorting**: Grade material quality (Grade A/B/C/Rejected)
2. **⚙️ Crushing**: Crush into smaller pieces
3. **💧 Washing**: Clean the material
4. **📦 Pelleting**: Create finished pellets

Each stage includes:
- Input/output quantity tracking
- Automatic loss calculation (KG, %, KSH)
- Operator details
- Processing notes
- Quality control data

**[View Complete Processing Documentation →](./PROCESSING_STAGES.md)**

## Tech Stack

- **Frontend**: React + TypeScript
- **Styling**: Tailwind CSS
- **Icons**: Lucide React
- **Build**: Vite

## Getting Started

### Installation

```powershell
npm install
```

### Development

```powershell
npm run dev
```

Open http://localhost:5173 in your browser.

### Build for Production

```powershell
npm run build
```

## Project Structure

```
src/
├── components/
│   ├── SenderPanel.tsx              # Sender dashboard with stats
│   ├── SenderForm.tsx               # Create new shipment
│   ├── SenderShipmentList.tsx       # List of sender shipments
│   ├── ReceiverPanel.tsx            # Receiver dashboard
│   ├── ReceiverShipmentList.tsx     # List with stage indicators
│   ├── ReceiverUpdateModal.tsx      # Receipt & stage management
│   ├── ReceiptForm.tsx              # Material receipt form
│   ├── StageProgressTracker.tsx     # Visual stage progress (NEW)
│   └── ProcessingStageModal.tsx     # Stage data entry (NEW)
├── types/
│   └── index.ts                     # TypeScript interfaces
├── App.tsx                          # Main app component
├── index.css                        # Global styles + Material theme
└── main.tsx                         # Entry point
```

## Key Components

### StageProgressTracker
Visual component showing processing progress with:
- Current stage indicator (animated)
- Completed stages (checkmarks)
- Locked stages (grayed out)
- Loss summaries per stage
- Cumulative loss display

### ProcessingStageModal
Stage-specific data entry with:
- Input quantity (auto-calculated)
- Output quantity entry
- Real-time loss preview
- Quality grading (Stage 1)
- Product specs (Stage 4)
- Operator and notes fields

### ReceiverUpdateModal
Enhanced modal with:
- Receipt step for incoming shipments
- Stage progress tracker
- 4 action cards for each processing stage
- Status-aware buttons (Start/Completed/Locked)
- Comprehensive data display

## Workflow

### Sender Side
1. Click "New Shipment"
2. Enter purchase details (supplier, material, quantity, rate)
3. Specify receiver
4. Track shipment status
5. View losses and cost analysis

### Receiver Side
1. View incoming shipments (orange badge)
2. Click shipment → Enter received quantity
3. System calculates transport loss
4. Click "Start Sorting" (Stage 1)
5. Enter output, quality grade, operator, notes
6. Repeat for Stages 2, 3, 4
7. View cumulative loss and final cost

## Material Design Theme

The app uses a Material Design inspired theme with:
- **Background**: #FAFAFA
- **Primary**: #2E7D32 (rich green)
- **Secondary**: #81C784 (mint green)
- **Accent**: #FFC107 (amber)
- **Text**: #263238

Features:
- Layered cards with elevation shadows
- Floating action buttons (FAB)
- Smooth transitions
- Consistent spacing and typography
- Gradient feature cards (warm, aqua, purple variants)

## Data Persistence

Currently uses in-memory state (data resets on refresh).

**Future**: Add localStorage/backend API for persistence.

## Browser Support

- Chrome (recommended)
- Edge
- Firefox
- Safari

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## License

MIT

## Documentation

- **[4-Stage Processing System](./PROCESSING_STAGES.md)** - Complete guide to processing stages
- **[Component API](#)** - Coming soon
- **[Data Schema](#)** - Coming soon

## Support

For issues or questions, please open an issue on GitHub.

---

**Built with ❤️ for the recycling industry**
