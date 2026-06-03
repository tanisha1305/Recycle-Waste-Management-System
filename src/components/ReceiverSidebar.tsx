import { LayoutDashboard, Package, Calculator, TrendingUp, Users, UserCheck, X, Menu, FileText, Receipt, FileSpreadsheet, ArrowLeftRight, Truck, ShoppingCart, BookOpen, CreditCard, LogOut, Shield, Settings, Database, Activity, DollarSign, Globe } from 'lucide-react';
import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { getRoleDisplayName, getRoleColor } from '../services/userService';
import { subscribeToCompanyDetails, CompanyDetails } from '../services/companyService';

interface ReceiverSidebarProps {
  activeView: 'shipments' | 'dashboard' | 'inventory' | 'accounting' | 'income-expense' | 'customers' | 'suppliers' | 'statements' | 'debit-credit-notes' | 'invoices' | 'quotations' | 'direct-purchase' | 'ledger' | 'company-details' | 'transactions' | 'user-management' | 'settings' | 'database-settings' | 'activity-logs' | 'payment-tracking' | 'import-export';
  onViewChange: (view: 'shipments' | 'dashboard' | 'inventory' | 'accounting' | 'income-expense' | 'customers' | 'suppliers' | 'statements' | 'debit-credit-notes' | 'invoices' | 'quotations' | 'direct-purchase' | 'ledger' | 'company-details' | 'transactions' | 'user-management' | 'settings' | 'database-settings' | 'activity-logs' | 'payment-tracking' | 'import-export') => void;
  mode: 'purchase' | 'receive';
  onModeChange: (mode: 'purchase' | 'receive') => void;
}

export default function ReceiverSidebar({ activeView, onViewChange, mode, onModeChange }: ReceiverSidebarProps) {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const { user, logout, hasPermission } = useAuth();
  const [companyDetails, setCompanyDetails] = useState<CompanyDetails | null>(null);

  // Subscribe to company details
  useEffect(() => {
    const unsubscribe = subscribeToCompanyDetails(
      (details) => {
        setCompanyDetails(details);
      },
      (error) => {
        console.error('Error loading company details:', error);
      }
    );

    return () => unsubscribe();
  }, []);

  const allMenuItems = [
    { 
      id: 'company-details' as const, 
      label: 'Company Details', 
      icon: FileText,
      permission: 'canManageUsers' as const,
      adminOnly: true
    },
    { 
      id: 'dashboard' as const, 
      label: 'Dashboard', 
      icon: LayoutDashboard,
      permission: 'canViewDashboard' as const,
      showInModes: ['purchase', 'receive'] as ('purchase' | 'receive')[]
    },
    { 
      id: 'shipments' as const, 
      label: 'Shipments', 
      icon: Package,
      permission: 'canViewShipments' as const
    },
    { 
      id: 'inventory' as const, 
      label: 'Inventory', 
      icon: Package,
      permission: 'canViewInventory' as const
    },
    { 
      id: 'direct-purchase' as const, 
      label: 'Direct Purchase', 
      icon: ShoppingCart,
      permission: 'canRecordExpenses' as const
    },
    { 
      id: 'accounting' as const, 
      label: 'Basic Accounting', 
      icon: Calculator,
      permission: 'canViewFinancialReports' as const
    },
    // { 
    //   id: 'ledger' as const, 
    //   label: 'Ledger', 
    //   icon: BookOpen,
    //   permission: 'canViewFinancialReports' as const
    // },
    { 
      id: 'transactions' as const, 
      label: 'Transactions', 
      icon: CreditCard,
      permission: 'canRecordExpenses' as const,
      showInModes: ['purchase', 'receive'] as ('purchase' | 'receive')[]
    },
    { 
      id: 'payment-tracking' as const, 
      label: 'Payments', 
      icon: DollarSign,
      permission: 'canViewFinancialReports' as const,
      showInModes: ['purchase', 'receive'] as ('purchase' | 'receive')[]
    },
    { 
      id: 'income-expense' as const, 
      label: 'Expenses', 
      icon: TrendingUp,
      permission: 'canRecordExpenses' as const
    },
    { 
      id: 'invoices' as const, 
      label: 'Invoices', 
      icon: FileSpreadsheet,
      permission: 'canGenerateReports' as const
    },
    { 
      id: 'quotations' as const, 
      label: 'Quotations', 
      icon: FileText,
      permission: 'canGenerateReports' as const
    },
    { 
      id: 'debit-credit-notes' as const, 
      label: 'Debit/Credit Notes', 
      icon: Receipt,
      permission: 'canGenerateReports' as const
    },
    { 
      id: 'statements' as const, 
      label: 'Statements', 
      icon: FileText,
      permission: 'canGenerateReports' as const,
      hideInModes: ['purchase', 'receive'] as ('purchase' | 'receive')[]
    },
    { 
      id: 'import-export' as const, 
      label: 'Import / Export', 
      icon: Globe,
      permission: 'canViewDashboard' as const,
      showInModes: ['purchase', 'receive'] as ('purchase' | 'receive')[]
    },
    { 
      id: 'customers' as const, 
      label: 'Customer List', 
      icon: Users,
      permission: 'canViewDashboard' as const
    },
    { 
      id: 'suppliers' as const, 
      label: 'Supplier List', 
      icon: UserCheck,
      permission: 'canViewDashboard' as const
    },
    { 
      id: 'user-management' as const, 
      label: 'User Management', 
      icon: Shield,
      permission: 'canManageUsers' as const,
      adminOnly: true
    },
    { 
      id: 'activity-logs' as const, 
      label: 'Activity Logs', 
      icon: Activity,
      permission: 'canManageUsers' as const,
      adminOnly: true
    },
    { 
      id: 'database-settings' as const, 
      label: 'Database Settings', 
      icon: Database,
      permission: 'canManageUsers' as const,
      adminOnly: true
    },
  ];

  // Filter menu items based on permissions and mode
  const menuItems = allMenuItems.filter(item => {
    if (!item.permission) return true;
    if (!hasPermission(item.permission)) return false;
    // Filter by mode if showInModes is specified
    if ('showInModes' in item && item.showInModes) {
      return item.showInModes.includes(mode);
    }
    // Hide if hideInModes is specified and current mode matches
    if ('hideInModes' in item && item.hideInModes) {
      return !item.hideInModes.includes(mode);
    }
    return true;
  });

  const handleMenuClick = (viewId: typeof activeView) => {
    onViewChange(viewId);
    setIsMobileMenuOpen(false);
  };

  const handleLogout = () => {
    if (confirm('Are you sure you want to logout?')) {
      logout();
    }
  };

  const roleColor = user ? getRoleColor(user.role) : { bg: 'bg-gray-100', text: 'text-gray-800' };

  return (
    <>
      {/* Mobile Hamburger Button */}
      <button
        onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
        className="lg:hidden fixed top-4 left-4 z-50 p-2 bg-white rounded-lg shadow-lg border border-gray-200"
      >
        {isMobileMenuOpen ? (
          <X className="w-6 h-6 text-gray-700" />
        ) : (
          <Menu className="w-6 h-6 text-gray-700" />
        )}
      </button>

      {/* Mobile Overlay */}
      {isMobileMenuOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-black/50 z-30"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed lg:static inset-y-0 left-0 z-40 w-64 bg-white border-r border-gray-200 transition-transform duration-300 ease-in-out ${
          isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        <div className="h-full flex flex-col">
          {/* User Info Section */}
          {user && (
            <div className="p-4 border-b border-gray-200 bg-gradient-to-r from-emerald-50 to-blue-50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-emerald-500 flex items-center justify-center text-white font-semibold">
                  {user.fullName.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-gray-900 truncate text-sm">
                    {user.fullName}
                  </p>
                  <span className={`inline-flex px-2 py-0.5 text-xs font-semibold rounded-full ${roleColor.bg} ${roleColor.text}`}>
                    {getRoleDisplayName(user.role)}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Navigation Menu */}
          <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
            {/* Company Details - Show first for admins */}
            {hasPermission('canManageUsers') && (
              <>
                <button
                  onClick={() => handleMenuClick('company-details')}
                  className={`w-full flex flex-col gap-1 px-4 py-3 rounded-lg transition-colors text-left ${
                    activeView === 'company-details'
                      ? 'bg-blue-50 text-blue-700 font-semibold'
                      : 'text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <FileText className={`w-5 h-5 flex-shrink-0 ${activeView === 'company-details' ? 'text-blue-700' : 'text-gray-500'}`} />
                    <span className="text-sm font-medium">Company Details</span>
                  </div>
                  {companyDetails && (
                    <div className="ml-8 text-xs text-gray-500 space-y-0.5">
                      <div className="truncate">{companyDetails.companyName}</div>
                      <div className="truncate">{companyDetails.companyPIN}</div>
                    </div>
                  )}
                </button>

                {/* Divider */}
                <div className="border-t border-gray-200 my-2"></div>
              </>
            )}

            {/* Mode Toggle Buttons - only show if user has relevant permissions */}
            {(hasPermission('canEnterMaterialReceipt') || hasPermission('canMonitorOperations')) && (
              <>
                <button
                  onClick={() => onModeChange('purchase')}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                    mode === 'purchase'
                      ? 'bg-emerald-50 text-emerald-700 font-semibold'
                      : 'text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  <Package className={`w-5 h-5 ${mode === 'purchase' ? 'text-emerald-700' : 'text-gray-500'}`} />
                  <span className="text-sm">Goods Purchase</span>
                </button>
                
                <button
                  onClick={() => onModeChange('receive')}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                    mode === 'receive'
                      ? 'bg-blue-50 text-blue-700 font-semibold'
                      : 'text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  <ArrowLeftRight className={`w-5 h-5 ${mode === 'receive' ? 'text-blue-700' : 'text-gray-500'}`} />
                  <span className="text-sm">Goods Receive</span>
                </button>

                {/* Divider */}
                <div className="border-t border-gray-200 my-2"></div>
              </>
            )}

            {/* Menu Items - Filter out company-details since it's shown separately */}
            {menuItems.filter(item => item.id !== 'company-details').map((item) => {
              const Icon = item.icon;
              const isActive = activeView === item.id;

              return (
                <button
                  key={item.id}
                  onClick={() => handleMenuClick(item.id)}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                    isActive
                      ? 'bg-blue-50 text-blue-700 font-semibold'
                      : 'text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  <Icon className={`w-5 h-5 ${isActive ? 'text-blue-700' : 'text-gray-500'}`} />
                  <span className="text-sm">{item.label}</span>
                </button>
              );
            })}
          </nav>

          {/* Logout Button */}
          <div className="p-4 border-t border-gray-200">
            <button
              onClick={handleLogout}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-red-600 hover:bg-red-50 transition-colors font-medium"
            >
              <LogOut className="w-5 h-5" />
              <span className="text-sm">Logout</span>
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
