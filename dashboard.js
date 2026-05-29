// Tab switching functionality
document.addEventListener('DOMContentLoaded', () => {
  const tabButtons = document.querySelectorAll('.tab-button');
  const tabContents = document.querySelectorAll('.tab-content');
  const ACTIVE_TAB_KEY = 'activeDashboardTab';

  // Retrieve last active tab from storage
  const lastActiveTab = localStorage.getItem(ACTIVE_TAB_KEY) || 'stale-tabs';

  function showTab(tabName) {
    // Hide all tabs
    tabContents.forEach(content => {
      content.classList.remove('active');
    });

    // Deactivate all buttons
    tabButtons.forEach(button => {
      button.classList.remove('active');
    });

    // Show selected tab
    const tabContent = document.getElementById(tabName);
    if (tabContent) {
      tabContent.classList.add('active');
    }

    // Activate selected button
    const tabButton = document.querySelector(`[data-tab="${tabName}"]`);
    if (tabButton) {
      tabButton.classList.add('active');
    }

    // Save preference
    localStorage.setItem(ACTIVE_TAB_KEY, tabName);

    // Trigger refresh for specific tabs if needed
    if (tabName === 'report') {
      const refreshBtn = document.getElementById('refreshBtn');
      if (refreshBtn && typeof window.loadReportData === 'function') {
        setTimeout(() => window.loadReportData(), 100);
      }
    } else if (tabName === 'open-tabs') {
      const refreshBtn2 = document.getElementById('refreshBtn2');
      if (refreshBtn2 && typeof window.loadOpenTabsData === 'function') {
        setTimeout(() => window.loadOpenTabsData(), 100);
      }
    }
  }

  // Add click listeners to tab buttons
  tabButtons.forEach(button => {
    button.addEventListener('click', () => {
      const tabName = button.getAttribute('data-tab');
      showTab(tabName);
    });
  });

  // Initialize with last active tab
  showTab(lastActiveTab);

  // Also initialize popup data on first load
  if (typeof window.loadData === 'function') {
    window.loadData().catch(err => {
      console.error('Failed to load popup data:', err);
    });
  }
});
