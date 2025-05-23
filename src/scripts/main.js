// This file contains JavaScript code for interactivity on the website, such as smooth scrolling or dynamic content loading.

document.addEventListener('DOMContentLoaded', function() {
    // Smooth scroll to the blog section when a blog entry is clicked
    const blogEntries = document.querySelectorAll('.blog-entry-link');
    blogEntries.forEach(entry => {
        entry.addEventListener('click', function(event) {
            event.preventDefault();
            const targetId = this.getAttribute('href');
            document.querySelector(targetId).scrollIntoView({ behavior: 'smooth' });
        });
    });

    // Load blog posts dynamically from JSON
    fetch('../content/blog-posts.json')
        .then(response => response.json())
        .then(data => {
            const blogContainer = document.querySelector('#blog-container');
            data.posts.forEach(post => {
                const entry = document.createElement('div');
                entry.classList.add('blog-entry');
                entry.innerHTML = `
                    <h2>${post.title}</h2>
                    <p>${post.excerpt}</p>
                    <a href="${post.link}" class="blog-entry-link">Read more</a>
                `;
                blogContainer.appendChild(entry);
            });
        })
        .catch(error => console.error('Error loading blog posts:', error));
});