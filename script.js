// Modern website interactions and animations

// Smooth animations and interactions
document.addEventListener('DOMContentLoaded', function() {
  // Add loading animation to link cards
  const linkCards = document.querySelectorAll('.link-card');
  
  linkCards.forEach((card, index) => {
    // Add staggered animation delay
    card.style.animationDelay = `${0.3 + (index * 0.1)}s`;
    
    // Add click feedback
    card.addEventListener('click', function() {
      this.classList.add('loading');
      
      // Remove loading class after a short delay
      setTimeout(() => {
        this.classList.remove('loading');
      }, 500);
    });
  });

  // Add intersection observer for scroll animations
  const observerOptions = {
    threshold: 0.1,
    rootMargin: '0px 0px -50px 0px'
  };

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.style.opacity = '1';
        entry.target.style.transform = 'translateY(0)';
      }
    });
  }, observerOptions);

  // Observe elements for scroll animations
  const animatedElements = document.querySelectorAll('.links-section, .social-section, .footer');
  animatedElements.forEach(el => {
    el.style.opacity = '0';
    el.style.transform = 'translateY(30px)';
    el.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
    observer.observe(el);
  });

  // Add hover sound effect (optional - creates a subtle interaction)
  linkCards.forEach(card => {
    card.addEventListener('mouseenter', function() {
      // Create a subtle visual feedback
      this.style.transform = 'translateY(-4px) scale(1.02)';
    });
    
    card.addEventListener('mouseleave', function() {
      this.style.transform = 'translateY(0) scale(1)';
    });
  });

  // Smooth scroll for any anchor links
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
      e.preventDefault();
      const target = document.querySelector(this.getAttribute('href'));
      if (target) {
        target.scrollIntoView({
          behavior: 'smooth',
          block: 'start'
        });
      }
    });
  });

  // Add parallax effect to background (subtle)
  window.addEventListener('scroll', function() {
    const scrolled = window.pageYOffset;
    const parallax = document.querySelector('.container');
    const speed = scrolled * 0.5;
    
    if (parallax) {
      parallax.style.transform = `translateY(${speed}px)`;
    }
  });

  // Add keyboard navigation support
  document.addEventListener('keydown', function(e) {
    const focusableElements = document.querySelectorAll('a, button, [tabindex]:not([tabindex="-1"])');
    const currentFocus = document.activeElement;
    const currentIndex = Array.from(focusableElements).indexOf(currentFocus);
    
    if (e.key === 'Tab') {
      // Let the browser handle tab navigation
      return;
    }
    
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault();
      const nextIndex = (currentIndex + 1) % focusableElements.length;
      focusableElements[nextIndex].focus();
    }
    
    if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      const prevIndex = currentIndex === 0 ? focusableElements.length - 1 : currentIndex - 1;
      focusableElements[prevIndex].focus();
    }
  });

  // Add loading state for external links
  linkCards.forEach(card => {
    if (card.href && !card.href.startsWith('mailto:')) {
      card.addEventListener('click', function() {
        this.classList.add('loading');
        
        // Remove loading state after navigation
        setTimeout(() => {
          this.classList.remove('loading');
        }, 1000);
      });
    }
  });
});

// Utility function for smooth animations
function animateElement(element, animation, duration = 300) {
  element.style.transition = `all ${duration}ms ease`;
  element.classList.add(animation);
  
  setTimeout(() => {
    element.classList.remove(animation);
  }, duration);
}
