import { useState, useEffect } from 'react';
import { Package } from 'lucide-react';
import SenderPanel from './components/SenderPanel';
import ReceiverPanel from './components/ReceiverPanel';
import Login from './components/Login';
import { Shipment } from './types';
import { Supplier } from './components/SupplierList';
import { subscribeToShipments } from './services/shipmentService';
import { subscribeToSuppliers } from './services/supplierService';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { seedMockUsers } from './services/authService';

function AppContent() {
  const { user, isLoading: authLoading } = useAuth();
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [activeTab, setActiveTab] = useState<'sender' | 'receiver'>('sender');
  const [loading, setLoading] = useState(true);
  const [seedingUsers, setSeedingUsers] = useState(false);

  // Seed mock users on first mount (only if no users exist)
  useEffect(() => {
    const initializeUsers = async () => {
      try {
        setSeedingUsers(true);
        await seedMockUsers();
      } catch (error) {
        console.error('Error seeding users:', error);
      } finally {
        setSeedingUsers(false);
      }
    };

    initializeUsers();
  }, []);

  // Subscribe to real-time updates for shipments and suppliers
  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }

    console.log('Setting up Firestore subscriptions...');
    
    // Subscribe to shipments
    const unsubscribeShipments = subscribeToShipments(
      (updatedShipments) => {
        console.log('Received shipments update:', updatedShipments.length);
        setShipments(updatedShipments);
        setLoading(false);
      },
      (error) => {
        console.error('Error in shipments subscription:', error);
        setLoading(false);
      }
    );

    // Subscribe to suppliers
    const unsubscribeSuppliers = subscribeToSuppliers(
      (updatedSuppliers) => {
        console.log('Received suppliers update:', updatedSuppliers.length);
        setSuppliers(updatedSuppliers);
      },
      (error) => {
        console.error('Error in suppliers subscription:', error);
      }
    );

    // Cleanup subscriptions on unmount
    return () => {
      unsubscribeShipments();
      unsubscribeSuppliers();
    };
  }, [user]);

  const handleAddShipment = (_shipment: Shipment) => {
    // Real-time listener will automatically update the state
    console.log('Shipment will be added via Firestore');
  };

  const handleUpdateShipment = (_updatedShipment: Shipment) => {
    // Real-time listener will automatically update the state
    console.log('Shipment will be updated via Firestore');
  };

  const handleAddReceipt = (_shipment: Shipment) => {
    // Real-time listener will automatically update the state
    console.log('Receipt will be added via Firestore');
  };

  // Show login screen if not authenticated
  if (authLoading || seedingUsers) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-emerald-500 border-t-transparent"></div>
          <p className="mt-4 text-gray-600">
            {seedingUsers ? 'Initializing system...' : 'Loading...'}
          </p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Login />;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Loading State */}
      {loading ? (
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="text-center">
            <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-emerald-500 border-t-transparent"></div>
            <p className="mt-4 text-gray-600">Loading data from Firestore...</p>
          </div>
        </div>
      ) : (
        /* Main Content */
        activeTab === 'sender' ? (
          <SenderPanel
            shipments={shipments}
            onAddShipment={handleAddShipment}
            suppliers={suppliers}
            setSuppliers={setSuppliers}
            activeTab={activeTab}
            onTabChange={setActiveTab}
          />
        ) : (
          <ReceiverPanel
            shipments={shipments}
            onUpdateShipment={handleUpdateShipment}
            onAddReceipt={handleAddReceipt}
            suppliers={suppliers}
            setSuppliers={setSuppliers}
            activeTab={activeTab}
            onTabChange={setActiveTab}
          />
        )
      )}
    </div>
  );
}

function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

export default App;
