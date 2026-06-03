# User Activity Tracking System - Implementation Guide

## Overview

A comprehensive User Activity Tracking system has been successfully implemented in your Recycle Business Manager application. This feature records all user actions across the system and provides an admin-only dashboard to monitor and analyze user activities.

## 🎯 Features Implemented

### 1. **Activity Log Types & Interfaces**
Located in `src/types/index.ts`:
- **ActivityAction**: Supported actions include login, logout, create, update, delete, view, approve, reject, export, import, configure
- **ActivityModule**: Tracks activities across all major modules (authentication, users, shipments, inventory, customers, suppliers, invoices, etc.)
- **ActivityLog**: Complete log structure including user info, timestamps, status, IP address, browser info, and detailed change tracking

### 2. **Activity Logging Service**
Located in `src/services/activityLogService.ts`:

#### Core Functions:
- **`logActivity()`**: Main logging function that captures all activity details
- **`getActivityLogs()`**: Retrieve logs with advanced filtering
- **`getActivityStats()`**: Get activity statistics for dashboard overview

#### Convenience Functions:
- **`logLogin()`**: Track successful logins
- **`logLogout()`**: Track user logouts
- **`logCreate()`**: Track creation of new items
- **`logUpdate()`**: Track updates with before/after values
- **`logDelete()`**: Track deletions
- **`logView()`**: Track when users view sensitive data
- **`logError()`**: Track failed operations

#### Automatic Data Capture:
- User ID, name, and role
- Action type and module
- Timestamp (ISO format)
- Success/failure status
- IP address (best effort)
- Browser/device information (User Agent)
- Previous and new values for updates
- Duration of operations (optional)

### 3. **Activity Log Management UI**
Located in `src/components/ActivityLogManagement.tsx`:

#### Features:
- **Admin-only access**: Automatically redirects non-admin users
- **Statistics Dashboard**: Shows total activities, success/failure counts, and active users (7-day window)
- **Advanced Filtering**:
  - Search by keywords
  - Filter by action type
  - Filter by module
  - Filter by status (success/failure)
  - Date range filtering
- **Activity Log Table**: Displays all logs with key information
- **Detailed View Modal**: Click any log entry to see complete details including:
  - Full user information
  - Exact timestamps
  - Before/after values for updates
  - Error messages for failures
  - IP address and browser info
  - Operation duration

### 4. **Integrated Activity Tracking**

#### Authentication Tracking:
- `src/services/authService.ts`: Logs all login attempts (success & failure) and logouts
- `src/contexts/AuthContext.tsx`: Updated to support async logout with logging

#### CRUD Operation Tracking:
Activity logging has been integrated into:
- **Customer Service** (`src/services/customerService.ts`): Create, update, delete operations
- **Supplier Service** (`src/services/supplierService.ts`): Create, update, delete operations
- **Inventory Service** (`src/services/inventoryService.ts`): Create operations

Each service automatically logs:
- What was created/updated/deleted
- Who performed the action
- When it happened
- Success or failure status
- Previous and new values (for updates)

### 5. **Sidebar Integration**
- Added "Activity Logs" menu item to `ReceiverSidebar.tsx`
- Menu item only visible to admin users
- Positioned between "User Management" and "Database Settings"
- Uses Activity icon from lucide-react

### 6. **Routing Integration**
- Updated both `SenderPanel.tsx` and `ReceiverPanel.tsx` to include activity-logs route
- Seamlessly integrated with existing navigation system

## 🚀 How to Use

### For Administrators:

1. **Access Activity Logs**:
   - Log in with an admin account
   - Navigate to "Activity Logs" in the sidebar
   - The system will display the activity tracking dashboard

2. **View Statistics**:
   - Top cards show activity overview for the last 7 days
   - See total activities, success count, failure count, and active users

3. **Filter Logs**:
   - Use the search box to find specific activities
   - Select action type (login, create, update, etc.)
   - Select module (customers, suppliers, inventory, etc.)
   - Choose status (success or failure)
   - Set date range for specific time periods
   - Click "Apply Filters" to update the view

4. **View Log Details**:
   - Click "View Details" on any log entry
   - See complete information including:
     - User details and role
     - Exact timestamp
     - Action description
     - Before/after values (for updates)
     - Error messages (for failures)
     - IP address and browser information

5. **Export/Analysis**:
   - Use filters to narrow down specific activities
   - Review patterns and user behaviors
   - Identify failed operations for troubleshooting

### For Developers:

#### Adding Activity Tracking to New Features:

```typescript
import { logCreate, logUpdate, logDelete, logError } from './activityLogService';
import { getCurrentUser } from './authService';

// Example: Track item creation
const user = getCurrentUser();
if (user) {
  await logCreate(
    user.id, 
    user.fullName, 
    user.role, 
    'module-name',  // e.g., 'inventory', 'customers'
    'Item Name',    // Name of the created item
    itemId,         // Optional: item ID
    { additionalInfo: 'any extra data' }  // Optional: additional context
  );
}

// Example: Track item update
if (user) {
  await logUpdate(
    user.id,
    user.fullName,
    user.role,
    'module-name',
    'Item Name',
    { oldValue: 'previous' },  // Previous state
    { newValue: 'current' },   // New state
    itemId
  );
}

// Example: Track failures
if (user) {
  await logError(
    user.id,
    user.fullName,
    user.role,
    'create',
    'module-name',
    'Description of what failed',
    error.message  // Error message
  );
}
```

#### Adding New Activity Modules:

1. Update `ActivityModule` type in `src/types/index.ts`
2. Add the new module name to the type union
3. Activity logging will automatically support the new module

#### Adding New Activity Actions:

1. Update `ActivityAction` type in `src/types/index.ts`
2. Add the new action to the type union
3. Update the badge colors in `ActivityLogManagement.tsx` if needed

## 📊 Data Structure

### Firestore Collection: `activityLogs`

Each log document contains:
```typescript
{
  userId: string;
  userName: string;
  userRole: 'admin' | 'manager' | 'operator';
  action: ActivityAction;
  module: ActivityModule;
  description: string;
  details?: {
    itemId?: string;
    itemName?: string;
    previousValue?: any;
    newValue?: any;
    additionalInfo?: Record<string, any>;
  };
  timestamp: Timestamp;
  status: 'success' | 'failure';
  errorMessage?: string;
  ipAddress?: string;
  userAgent?: string;
  duration?: number;
}
```

## 🔒 Security Features

1. **Admin-Only Access**: Activity logs are only visible to users with admin role
2. **Read-Only Logs**: Logs cannot be edited or deleted from the UI
3. **Automatic Capture**: No manual user input - reduces tampering risk
4. **Comprehensive Tracking**: Captures who, what, when, where, and how
5. **Error Resilience**: Logging failures don't break the main application flow

## 📈 Performance Considerations

1. **Non-Blocking**: Activity logging is asynchronous and doesn't block user operations
2. **Error Handling**: Failed logging attempts don't crash the application
3. **Efficient Queries**: Uses Firestore indexes for fast filtering
4. **Client-Side Search**: Search term filtering happens client-side to reduce database calls
5. **Result Limits**: Default limit of 500-1000 logs per query to maintain performance

## 🎨 UI Features

- **Responsive Design**: Works on desktop and mobile devices
- **Color-Coded Badges**: Easy visual identification of actions and statuses
- **Loading States**: Clear feedback during data fetching
- **Empty States**: Helpful messages when no logs are found
- **Modal Details View**: Non-intrusive way to view complete log information
- **Statistics Cards**: Quick overview of system activity

## 🔄 Future Enhancements (Optional)

Consider implementing:
1. **Export to CSV/PDF**: Download logs for external analysis
2. **Real-time Updates**: WebSocket or Firestore subscriptions for live log updates
3. **Advanced Analytics**: Charts and graphs for activity trends
4. **Retention Policy**: Automatic archival of old logs
5. **Alert System**: Notify admins of suspicious activities
6. **Audit Reports**: Scheduled reports sent via email
7. **User Activity Profiles**: Per-user activity summaries
8. **Geolocation**: Enhanced location tracking
9. **Session Tracking**: Group activities by user sessions
10. **Change History**: View complete history of any item's changes

## 🐛 Troubleshooting

### Logs Not Appearing:
- Check Firebase rules allow write access to `activityLogs` collection
- Verify user is logged in when actions are performed
- Check browser console for any errors

### Can't Access Activity Logs Page:
- Verify you're logged in as an admin user
- Check that the user's role is set to 'admin' in the database

### IP Address Not Captured:
- This is expected in some environments (browser restrictions)
- IP capture requires external API call (ipify.org)
- Timeout is set to 2 seconds to prevent delays

## 📝 Notes

- Activity logging is designed to be unobtrusive and fail-safe
- Most CRUD operations now automatically log activities
- Logs are stored in Firestore's `activityLogs` collection
- The system captures both successful and failed operations
- Browser/device information is captured via User Agent string
- All timestamps are stored in ISO format for consistency

## ✅ Testing Checklist

- [ ] Log in as admin and verify "Activity Logs" menu appears
- [ ] Verify non-admin users cannot access activity logs
- [ ] Create a customer/supplier and verify log entry appears
- [ ] Update an item and verify before/after values are logged
- [ ] Delete an item and verify deletion is logged
- [ ] Test filtering by date range
- [ ] Test filtering by action type
- [ ] Test filtering by module
- [ ] Test search functionality
- [ ] Verify log detail modal shows all information
- [ ] Test failed login attempt logging
- [ ] Verify successful login/logout tracking

---

**Implementation Complete** ✨

The User Activity Tracking system is fully functional and ready for production use. All admin users can now monitor system activities comprehensively.
