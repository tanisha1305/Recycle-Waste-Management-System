import { 
  collection, 
  addDoc, 
  query, 
  orderBy, 
  limit, 
  getDocs,
  where,
  Timestamp,
  DocumentData,
  Query,
  onSnapshot
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { ActivityLog, ActivityAction, ActivityModule, ActivityLogFilter, SystemRole } from '../types';

const ACTIVITY_LOGS_COLLECTION = 'activityLogs';

/**
 * Helper function to get client IP address (best effort)
 * Note: In a client-side app, true IP detection requires server-side support
 */
const getClientIP = async (): Promise<string | undefined> => {
  try {
    const response = await fetch('https://api.ipify.org?format=json', { 
      signal: AbortSignal.timeout(2000) 
    });
    const data = await response.json();
    return data.ip;
  } catch (error) {
    console.warn('Could not fetch IP address:', error);
    return undefined;
  }
};

/**
 * Get browser and device information
 */
const getUserAgent = (): string => {
  return navigator.userAgent;
};

/**
 * Main function to log any user activity
 * This should be called from anywhere in the application where tracking is needed
 */
export const logActivity = async (
  userId: string,
  userName: string,
  userRole: SystemRole,
  action: ActivityAction,
  module: ActivityModule,
  description: string,
  options?: {
    details?: {
      itemId?: string;
      itemName?: string;
      previousValue?: any;
      newValue?: any;
      additionalInfo?: Record<string, any>;
    };
    status?: 'success' | 'failure';
    errorMessage?: string;
    duration?: number;
  }
): Promise<void> => {
  try {
    console.log('🔍 Attempting to log activity:', { action, module, userId, userName });
    
    const timestamp = new Date().toISOString();
    const ipAddress = await getClientIP();
    const userAgent = getUserAgent();

    const activityLog: any = {
      userId,
      userName,
      userRole,
      action,
      module,
      description,
      timestamp: Timestamp.fromDate(new Date(timestamp)),
      status: options?.status || 'success',
      userAgent,
    };

    // Only add fields if they have values (Firestore doesn't accept undefined)
    if (options?.details) activityLog.details = options.details;
    if (options?.errorMessage) activityLog.errorMessage = options.errorMessage;
    if (ipAddress) activityLog.ipAddress = ipAddress;
    if (options?.duration) activityLog.duration = options.duration;

    console.log('📝 Activity log data prepared:', activityLog);

    // Add to Firestore
    console.log('💾 Attempting to write to Firestore collection:', ACTIVITY_LOGS_COLLECTION);
    const docRef = await addDoc(collection(db, ACTIVITY_LOGS_COLLECTION), activityLog);

    console.log('✅ Activity logged successfully with ID:', docRef.id, { action, module, status: options?.status || 'success' });
  } catch (error: any) {
    // Don't throw - logging failures shouldn't break the app
    console.error('❌ Failed to log activity:', error);
    console.error('Error details:', {
      code: error.code,
      message: error.message,
      name: error.name,
    });
    console.error('Activity details:', { userId, userName, action, module, description });
  }
};

/**
 * Fetch activity logs with optional filters
 * Returns logs in descending order by timestamp
 */
export const getActivityLogs = async (
  filter?: ActivityLogFilter,
  maxResults: number = 500
): Promise<ActivityLog[]> => {
  try {
    console.log('🔍 Fetching activity logs with filter:', filter);
    
    let q: Query<DocumentData> = collection(db, ACTIVITY_LOGS_COLLECTION);

    // Apply filters
    const constraints: any[] = [];

    if (filter?.userId) {
      constraints.push(where('userId', '==', filter.userId));
    }

    if (filter?.action) {
      constraints.push(where('action', '==', filter.action));
    }

    if (filter?.module) {
      constraints.push(where('module', '==', filter.module));
    }

    if (filter?.status) {
      constraints.push(where('status', '==', filter.status));
    }

    if (filter?.startDate) {
      constraints.push(where('timestamp', '>=', Timestamp.fromDate(new Date(filter.startDate))));
    }

    if (filter?.endDate) {
      const endDate = new Date(filter.endDate);
      endDate.setHours(23, 59, 59, 999); // Include full end date
      constraints.push(where('timestamp', '<=', Timestamp.fromDate(endDate)));
    }

    // Add constraints to query
    if (constraints.length > 0) {
      q = query(q as Query<DocumentData>, ...constraints);
    }

    // Order by timestamp (descending) and limit
    q = query(q, orderBy('timestamp', 'desc'), limit(maxResults));

    console.log('📊 Executing query with', constraints.length, 'constraints');
    
    const querySnapshot = await getDocs(q);
    const logs: ActivityLog[] = [];

    console.log('📦 Retrieved', querySnapshot.size, 'log documents from Firestore');

    querySnapshot.forEach((doc) => {
      const data = doc.data();
      logs.push({
        id: doc.id,
        userId: data.userId,
        userName: data.userName,
        userRole: data.userRole,
        action: data.action,
        module: data.module,
        description: data.description,
        details: data.details,
        timestamp: data.timestamp?.toDate?.()?.toISOString() || data.timestamp,
        status: data.status,
        errorMessage: data.errorMessage,
        ipAddress: data.ipAddress,
        userAgent: data.userAgent,
        duration: data.duration,
      });
    });

    console.log('✅ Processed', logs.length, 'activity logs');

    // Apply search term filter (client-side since Firestore doesn't support full-text search)
    if (filter?.searchTerm) {
      const searchLower = filter.searchTerm.toLowerCase();
      const filtered = logs.filter(log => 
        log.userName.toLowerCase().includes(searchLower) ||
        log.description.toLowerCase().includes(searchLower) ||
        log.action.toLowerCase().includes(searchLower) ||
        log.module.toLowerCase().includes(searchLower) ||
        log.details?.itemName?.toLowerCase().includes(searchLower)
      );
      console.log('🔎 Filtered to', filtered.length, 'logs matching search term');
      return filtered;
    }

    return logs;
  } catch (error) {
    console.error('❌ Error fetching activity logs:', error);
    throw new Error('Failed to fetch activity logs');
  }
};

/**
 * Real-time listener for activity logs
 * Subscribe to live updates from Firestore
 */
export const subscribeToActivityLogs = (
  callback: (logs: ActivityLog[]) => void,
  filter?: ActivityLogFilter,
  maxResults: number = 500,
  onError?: (error: Error) => void
) => {
  try {
    let q: Query<DocumentData> = collection(db, ACTIVITY_LOGS_COLLECTION);

    // Apply filters
    const constraints: any[] = [];

    if (filter?.userId) {
      constraints.push(where('userId', '==', filter.userId));
    }

    if (filter?.action) {
      constraints.push(where('action', '==', filter.action));
    }

    if (filter?.module) {
      constraints.push(where('module', '==', filter.module));
    }

    if (filter?.status) {
      constraints.push(where('status', '==', filter.status));
    }

    if (filter?.startDate) {
      constraints.push(where('timestamp', '>=', Timestamp.fromDate(new Date(filter.startDate))));
    }

    if (filter?.endDate) {
      const endDate = new Date(filter.endDate);
      endDate.setHours(23, 59, 59, 999);
      constraints.push(where('timestamp', '<=', Timestamp.fromDate(endDate)));
    }

    // Add constraints to query
    if (constraints.length > 0) {
      q = query(q as Query<DocumentData>, ...constraints);
    }

    // Order by timestamp (descending) and limit
    q = query(q, orderBy('timestamp', 'desc'), limit(maxResults));

    const unsubscribe = onSnapshot(
      q,
      (querySnapshot) => {
        const logs: ActivityLog[] = [];

        querySnapshot.forEach((doc) => {
          const data = doc.data();
          logs.push({
            id: doc.id,
            userId: data.userId,
            userName: data.userName,
            userRole: data.userRole,
            action: data.action,
            module: data.module,
            description: data.description,
            details: data.details,
            timestamp: data.timestamp?.toDate?.()?.toISOString() || data.timestamp,
            status: data.status,
            errorMessage: data.errorMessage,
            ipAddress: data.ipAddress,
            userAgent: data.userAgent,
            duration: data.duration,
          });
        });

        // Apply search term filter (client-side)
        if (filter?.searchTerm) {
          const searchLower = filter.searchTerm.toLowerCase();
          const filtered = logs.filter(log => 
            log.userName.toLowerCase().includes(searchLower) ||
            log.description.toLowerCase().includes(searchLower) ||
            log.action.toLowerCase().includes(searchLower) ||
            log.module.toLowerCase().includes(searchLower) ||
            log.details?.itemName?.toLowerCase().includes(searchLower)
          );
          callback(filtered);
        } else {
          callback(logs);
        }
      },
      (error) => {
        console.error('Error in activity logs subscription:', error);
        if (onError) onError(error as Error);
      }
    );

    return unsubscribe;
  } catch (error) {
    console.error('Error setting up activity logs subscription:', error);
    throw error;
  }
};

/**
 * Get activity statistics for dashboard/overview
 */
export const getActivityStats = async (days: number = 7): Promise<{
  totalActivities: number;
  successCount: number;
  failureCount: number;
  byAction: Record<ActivityAction, number>;
  byModule: Record<ActivityModule, number>;
  topUsers: Array<{ userId: string; userName: string; count: number }>;
}> => {
  try {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const logs = await getActivityLogs({ startDate: startDate.toISOString() }, 10000);

    const stats = {
      totalActivities: logs.length,
      successCount: logs.filter(l => l.status === 'success').length,
      failureCount: logs.filter(l => l.status === 'failure').length,
      byAction: {} as Record<ActivityAction, number>,
      byModule: {} as Record<ActivityModule, number>,
      topUsers: [] as Array<{ userId: string; userName: string; count: number }>,
    };

    // Count by action
    logs.forEach(log => {
      stats.byAction[log.action] = (stats.byAction[log.action] || 0) + 1;
      stats.byModule[log.module] = (stats.byModule[log.module] || 0) + 1;
    });

    // Count by user
    const userCounts = new Map<string, { userName: string; count: number }>();
    logs.forEach(log => {
      const current = userCounts.get(log.userId) || { userName: log.userName, count: 0 };
      current.count++;
      userCounts.set(log.userId, current);
    });

    // Convert to array and sort
    stats.topUsers = Array.from(userCounts.entries())
      .map(([userId, data]) => ({ userId, userName: data.userName, count: data.count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    return stats;
  } catch (error) {
    console.error('Error fetching activity stats:', error);
    throw new Error('Failed to fetch activity statistics');
  }
};

/**
 * Convenience functions for common activities
 */

/**
 * Test function to verify Firestore writes are working
 * Call this from browser console: window.testActivityLog()
 */
export const testActivityLog = async (): Promise<void> => {
  try {
    console.log('🧪 Testing activity log write to Firestore...');
    
    const testLog = {
      userId: 'test-user',
      userName: 'Test User',
      userRole: 'admin' as SystemRole,
      action: 'login' as ActivityAction,
      module: 'authentication' as ActivityModule,
      description: 'Test log entry',
      timestamp: Timestamp.now(),
      status: 'success',
    };
    
    console.log('📝 Test data:', testLog);
    console.log('📍 Writing to collection:', ACTIVITY_LOGS_COLLECTION);
    
    const docRef = await addDoc(collection(db, ACTIVITY_LOGS_COLLECTION), testLog);
    
    console.log('✅ TEST PASSED! Successfully wrote test log with ID:', docRef.id);
    console.log('🎉 Activity logging is working! If you still see 0 logs, try refreshing the page.');
    
    return;
  } catch (error: any) {
    console.error('❌ TEST FAILED! Error writing to Firestore:', error);
    console.error('Error code:', error.code);
    console.error('Error message:', error.message);
    
    if (error.code === 'permission-denied') {
      console.error('🚫 PERMISSION DENIED: Firestore security rules are blocking writes to activityLogs collection');
      console.error('📋 SOLUTION: Update Firebase security rules. See FIREBASE_RULES_FIX.md for instructions.');
    }
  }
};

// Expose test function to window for console access
if (typeof window !== 'undefined') {
  (window as any).testActivityLog = testActivityLog;
}

export const logLogin = async (userId: string, userName: string, userRole: SystemRole) => {
  await logActivity(userId, userName, userRole, 'login', 'authentication', `${userName} logged in successfully`);
};

export const logLogout = async (userId: string, userName: string, userRole: SystemRole) => {
  await logActivity(userId, userName, userRole, 'logout', 'authentication', `${userName} logged out`);
};

export const logCreate = async (
  userId: string,
  userName: string,
  userRole: SystemRole,
  module: ActivityModule,
  itemName: string,
  itemId?: string,
  additionalInfo?: Record<string, any>
) => {
  await logActivity(
    userId,
    userName,
    userRole,
    'create',
    module,
    `Created ${itemName}`,
    {
      details: {
        itemId,
        itemName,
        additionalInfo,
      },
    }
  );
};

export const logUpdate = async (
  userId: string,
  userName: string,
  userRole: SystemRole,
  module: ActivityModule,
  itemName: string,
  previousValue?: any,
  newValue?: any,
  itemId?: string
) => {
  await logActivity(
    userId,
    userName,
    userRole,
    'update',
    module,
    `Updated ${itemName}`,
    {
      details: {
        itemId,
        itemName,
        previousValue,
        newValue,
      },
    }
  );
};

export const logDelete = async (
  userId: string,
  userName: string,
  userRole: SystemRole,
  module: ActivityModule,
  itemName: string,
  itemId?: string
) => {
  await logActivity(
    userId,
    userName,
    userRole,
    'delete',
    module,
    `Deleted ${itemName}`,
    {
      details: {
        itemId,
        itemName,
      },
    }
  );
};

export const logView = async (
  userId: string,
  userName: string,
  userRole: SystemRole,
  module: ActivityModule,
  description: string
) => {
  await logActivity(userId, userName, userRole, 'view', module, description);
};

export const logError = async (
  userId: string,
  userName: string,
  userRole: SystemRole,
  action: ActivityAction,
  module: ActivityModule,
  description: string,
  errorMessage: string
) => {
  await logActivity(
    userId,
    userName,
    userRole,
    action,
    module,
    description,
    {
      status: 'failure',
      errorMessage,
    }
  );
};
