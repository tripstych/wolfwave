document.addEventListener('DOMContentLoaded', () => {
  const hero = document.querySelector('.nano-hero');
  if (hero) {
    hero.style.transition = 'transform 0.5s ease-out';
    hero.addEventListener('mouseover', () => {
      hero.style.transform = `rotate(${Math.random() * 4 - 2}deg) scale(1.05)`;
    });
    hero.addEventListener('mouseout', () => {
      hero.style.transform = 'rotate(-1deg) scale(1)';
    });
  }

  // Add playful hover effect to all cards
  const cards = document.querySelectorAll('.nano-card');
  cards.forEach(card => {
    card.addEventListener('mouseenter', () => {
      card.style.borderColor = '#' + Math.floor(Math.random()*16777215).toString(16);
    });
    card.addEventListener('mouseleave', () => {
      card.style.borderColor = '#2d3436';
    });
  });
});
