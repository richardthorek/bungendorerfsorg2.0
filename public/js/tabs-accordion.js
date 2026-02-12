/**
 * Tabs and Accordion Navigation Module
 * Handles tabbed navigation on desktop and accordion on mobile
 */

document.addEventListener("DOMContentLoaded", () => {
  // Tab and Accordion Elements
  const tabButtons = document.querySelectorAll(".tab-btn");
  const tabPanels = document.querySelectorAll(".tab-panel");
  const accordionHeaders = document.querySelectorAll(".accordion-header.mobile-only");

  /**
   * Get the active tab from URL hash or localStorage
   */
  function getInitialTab() {
    // Check URL hash first
    const urlHash = window.location.hash.replace('#', '');
    if (urlHash && urlHash.startsWith('tab=')) {
      const tabId = urlHash.replace('tab=', '');
      return tabId;
    }

    // Check localStorage
    const savedTab = localStorage.getItem('activeTab');
    if (savedTab) {
      return savedTab;
    }

    // Check if it's fire season (Oct-Mar) - show fire info by default
    const now = new Date();
    const month = now.getMonth() + 1;
    const isFireSeason = month >= 10 || month <= 3;

    // Default to fire-info during fire season, otherwise first tab
    return isFireSeason ? 'fire-info' : 'fire-info';
  }

  /**
   * Switch to a specific tab (desktop)
   */
  function switchTab(tabId) {
    // Deactivate all tabs and panels
    tabButtons.forEach(btn => {
      btn.classList.remove('active');
      btn.setAttribute('aria-selected', 'false');
    });

    tabPanels.forEach(panel => {
      panel.classList.remove('active');
    });

    // Activate the selected tab and panel
    const targetButton = document.querySelector(`[data-tab="${tabId}"]`);
    const targetPanel = document.getElementById(`${tabId}-tab`);

    if (targetButton) {
      targetButton.classList.add('active');
      targetButton.setAttribute('aria-selected', 'true');
    }

    if (targetPanel) {
      targetPanel.classList.add('active');
    }

    // Update URL hash without scrolling
    history.replaceState(null, null, `#tab=${tabId}`);

    // Save to localStorage
    localStorage.setItem('activeTab', tabId);

    // Scroll to tabs container smoothly
    const tabsContainer = document.querySelector('.content-tabs-container');
    if (tabsContainer) {
      const headerHeight = document.getElementById('siteHeader')?.offsetHeight || 60;
      const targetPosition = tabsContainer.offsetTop - headerHeight - 20;
      window.scrollTo({
        top: targetPosition,
        behavior: 'smooth'
      });
    }

    // Trigger lazy loading if needed
    lazyLoadTabContent(tabId);
  }

  /**
   * Toggle accordion (mobile)
   */
  function toggleAccordion(header) {
    const tabPanel = header.closest('.tab-panel');
    const content = header.nextElementSibling;
    const isActive = header.classList.contains('active');

    // Close all accordions (optional: remove these lines to allow multiple open)
    accordionHeaders.forEach(h => {
      h.classList.remove('active');
      if (h.nextElementSibling) {
        h.nextElementSibling.classList.remove('active');
      }
    });

    // Toggle current accordion
    if (!isActive) {
      header.classList.add('active');
      if (content) {
        content.classList.add('active');
      }

      // Save accordion state
      const tabId = tabPanel?.id?.replace('-tab', '') || 'fire-info';
      localStorage.setItem('activeTab', tabId);

      // Scroll to accordion
      const headerHeight = document.getElementById('siteHeader')?.offsetHeight || 60;
      const targetPosition = header.offsetTop - headerHeight - 10;
      setTimeout(() => {
        window.scrollTo({
          top: targetPosition,
          behavior: 'smooth'
        });
      }, 100); // Small delay to allow animation to start
    }
  }

  /**
   * Lazy load tab content if needed
   * Placeholder for future implementation
   */
  function lazyLoadTabContent(tabId) {
    // This would be implemented if we want to load content dynamically
    // For now, all content is already in the DOM
    console.log(`Switched to tab: ${tabId}`);
  }

  /**
   * Handle tab button clicks
   */
  tabButtons.forEach(button => {
    button.addEventListener('click', (e) => {
      e.preventDefault();
      const tabId = button.getAttribute('data-tab');
      if (tabId) {
        switchTab(tabId);
      }
    });

    // Keyboard navigation
    button.addEventListener('keydown', (e) => {
      const currentIndex = Array.from(tabButtons).indexOf(button);

      switch(e.key) {
        case 'ArrowRight':
          e.preventDefault();
          const nextIndex = (currentIndex + 1) % tabButtons.length;
          tabButtons[nextIndex].focus();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          const prevIndex = (currentIndex - 1 + tabButtons.length) % tabButtons.length;
          tabButtons[prevIndex].focus();
          break;
        case 'Home':
          e.preventDefault();
          tabButtons[0].focus();
          break;
        case 'End':
          e.preventDefault();
          tabButtons[tabButtons.length - 1].focus();
          break;
      }
    });
  });

  /**
   * Handle accordion header clicks (mobile)
   */
  accordionHeaders.forEach(header => {
    header.addEventListener('click', () => {
      toggleAccordion(header);
    });

    // Keyboard support
    header.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        toggleAccordion(header);
      }
    });
  });

  /**
   * Handle hash changes (for URL-based navigation)
   */
  window.addEventListener('hashchange', () => {
    const urlHash = window.location.hash.replace('#', '');
    if (urlHash && urlHash.startsWith('tab=')) {
      const tabId = urlHash.replace('tab=', '');
      switchTab(tabId);
    }
  });

  /**
   * Handle old hash links (backward compatibility)
   */
  document.querySelectorAll('a[href^="#"]').forEach(link => {
    link.addEventListener('click', (e) => {
      const href = link.getAttribute('href');

      // Map old section IDs to new tab IDs
      const sectionToTabMap = {
        '#info': 'fire-info',
        '#prepare': 'prepare',
        '#membership': 'membership',
        '#events': 'events'
      };

      if (sectionToTabMap[href]) {
        e.preventDefault();
        switchTab(sectionToTabMap[href]);
      }
    });
  });

  // Initialize with the correct tab
  const initialTab = getInitialTab();
  switchTab(initialTab);

  // Ensure first accordion is open on mobile by default
  if (window.innerWidth <= 768) {
    const firstAccordion = accordionHeaders[0];
    if (firstAccordion) {
      firstAccordion.classList.add('active');
      const firstContent = firstAccordion.nextElementSibling;
      if (firstContent) {
        firstContent.classList.add('active');
      }
    }
  }

  // Handle window resize (switch between tabs and accordion)
  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      // Reset states on resize
      if (window.innerWidth > 768) {
        // Desktop: ensure current tab is active
        const currentTab = localStorage.getItem('activeTab') || 'fire-info';
        switchTab(currentTab);
      } else {
        // Mobile: ensure first accordion is open
        accordionHeaders.forEach((h, index) => {
          if (index === 0) {
            h.classList.add('active');
            if (h.nextElementSibling) {
              h.nextElementSibling.classList.add('active');
            }
          }
        });
      }
    }, 250);
  });
});
