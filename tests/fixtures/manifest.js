module.exports = {
  manifest: {
    version: 2,
    content: [
      { path: 'kids/toy-story/content.json' },
      { path: 'kids/finding-nemo/content.json' },
      { path: 'adults/dark-knight/content.json' }
    ]
  },
  items: {
    'kids/toy-story/content.json': {
      type: 'single-film', id: 'toy-story', title: 'Toy Story',
      year: 1995, profile: 'kids', available: true
    },
    'kids/finding-nemo/content.json': {
      type: 'single-film', id: 'finding-nemo', title: 'Finding Nemo',
      year: 2003, profile: 'kids', available: true
    },
    'adults/dark-knight/content.json': {
      type: 'single-film', id: 'dark-knight', title: 'The Dark Knight',
      year: 2008, profile: 'adults', available: true
    }
  }
};
