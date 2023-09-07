const container = document.getElementById('container');
const resizableText = document.getElementById('resizable-text');

function adjustFontSize() {
    let fontSize = 10;
    const padding = 20; // 10px on each side
    resizableText.style.fontSize = `${fontSize}px`;
  
    while ((resizableText.offsetWidth + padding) < container.offsetWidth) {
      fontSize++;
      resizableText.style.fontSize = `${fontSize}px`;
    }
  
    while ((resizableText.offsetWidth + padding) > container.offsetWidth) {
      fontSize--;
      resizableText.style.fontSize = `${fontSize}px`;
    }
  }
  

// Initial adjustment
adjustFontSize();

// Adjust on window resize
window.addEventListener('resize', adjustFontSize);
