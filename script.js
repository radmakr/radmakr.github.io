document.addEventListener('DOMContentLoaded', () => {
    const year = document.getElementById('year');
    if (year) {
        year.textContent = new Date().getFullYear();
    }

    const linkCards = document.querySelectorAll('.link-card');
    linkCards.forEach((card, index) => {
        card.addEventListener('click', (e) => {
            e.preventDefault();
            
            const ripple = document.createElement('div');
            ripple.style.position = 'absolute';
            ripple.style.borderRadius = '50%';
            ripple.style.backgroundColor = 'rgba(255, 255, 255, 0.3)';
            ripple.style.width = '0';
            ripple.style.height = '0';
            ripple.style.transition = 'all 0.6s ease-out';
            ripple.style.pointerEvents = 'none';
            
            const rect = card.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            
            ripple.style.left = x + 'px';
            ripple.style.top = y + 'px';
            
            card.appendChild(ripple);
            
            setTimeout(() => {
                ripple.style.width = '300px';
                ripple.style.height = '300px';
                ripple.style.marginLeft = '-150px';
                ripple.style.marginTop = '-150px';
                ripple.style.opacity = '0';
            }, 10);
            
            setTimeout(() => {
                window.open(card.href, card.target);
                ripple.remove();
            }, 300);
        });
    });

    const terminalDots = document.querySelectorAll('.terminal-dot');
    terminalDots.forEach((dot, index) => {
        dot.addEventListener('mouseenter', () => {
            dot.style.filter = 'brightness(1.3)';
        });
        dot.addEventListener('mouseleave', () => {
            dot.style.filter = 'brightness(1)';
        });
    });

    const glitchElement = document.querySelector('.glitch');
    if (glitchElement) {
        let glitchActive = false;
        
        glitchElement.addEventListener('mouseenter', () => {
            if (!glitchActive) {
                glitchActive = true;
                glitchElement.style.animation = 'glitch-skew 0.3s infinite';
                
                setTimeout(() => {
                    glitchElement.style.animation = 'glitch-skew 1s infinite linear alternate-reverse';
                    glitchActive = false;
                }, 2000);
            }
        });
    }

    const codeBlock = document.querySelector('.code-block');
    if (codeBlock) {
        let mouseX = 0;
        let mouseY = 0;
        let blockX = window.innerWidth * 0.85;
        let blockY = window.innerHeight * 0.1;
        
        document.addEventListener('mousemove', (e) => {
            mouseX = e.clientX;
            mouseY = e.clientY;
        });
        
        function animateCodeBlock() {
            const dx = mouseX - blockX;
            const dy = mouseY - blockY;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            if (distance < 200) {
                const force = (200 - distance) / 200;
                blockX -= dx * force * 0.02;
                blockY -= dy * force * 0.02;
            } else {
                blockX += (window.innerWidth * 0.85 - blockX) * 0.05;
                blockY += (window.innerHeight * 0.1 - blockY) * 0.05;
            }
            
            codeBlock.style.left = blockX + 'px';
            codeBlock.style.top = blockY + 'px';
            
            requestAnimationFrame(animateCodeBlock);
        }
        
        animateCodeBlock();
    }

    const gridBg = document.querySelector('.grid-bg');
    if (gridBg) {
        let scrollY = 0;
        
        window.addEventListener('scroll', () => {
            scrollY = window.scrollY;
            gridBg.style.transform = `translateY(${scrollY * 0.5}px)`;
        });
    }

    const typedText = document.querySelector('.typed-text');
    const cursor = document.querySelector('.cursor');
    if (typedText && cursor) {
        const texts = ['Swift Developer', 'iOS Engineer', 'Bitcoiner', 'App Architect'];
        let textIndex = 0;
        let charIndex = 0;
        let isDeleting = false;
        let typingDelay = 100;
        
        function typeEffect() {
            const currentText = texts[textIndex];
            
            if (!isDeleting) {
                typedText.textContent = currentText.substring(0, charIndex + 1);
                charIndex++;
                
                if (charIndex === currentText.length) {
                    isDeleting = true;
                    typingDelay = 2000;
                } else {
                    typingDelay = 100;
                }
            } else {
                typedText.textContent = currentText.substring(0, charIndex - 1);
                charIndex--;
                
                if (charIndex === 0) {
                    isDeleting = false;
                    textIndex = (textIndex + 1) % texts.length;
                    typingDelay = 500;
                } else {
                    typingDelay = 50;
                }
            }
            
            setTimeout(typeEffect, typingDelay);
        }
        
        setTimeout(typeEffect, 1500);
    }

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.style.opacity = '1';
                entry.target.style.transform = 'translateY(0)';
            }
        });
    }, { threshold: 0.1 });

    document.querySelectorAll('.link-card').forEach(card => {
        card.style.opacity = '0';
        card.style.transform = 'translateY(20px)';
        observer.observe(card);
    });

    document.addEventListener('keydown', (e) => {
        if (e.key >= '1' && e.key <= '7') {
            const index = parseInt(e.key) - 1;
            const links = document.querySelectorAll('.link-card');
            if (links[index]) {
                links[index].click();
            }
        }
    });

    console.log('%cWelcome to my site! 🚀', 'color: #007AFF; font-size: 20px; font-weight: bold;');
    console.log('%cBuilt with love and clean code', 'color: #34C759; font-size: 14px;');
    console.log('%cCheck out the source on GitHub!', 'color: #8E8E93; font-size: 12px;');
});