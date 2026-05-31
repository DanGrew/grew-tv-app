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
      id: 'toy-story', title: 'Toy Story', profile: 'kids', available: true,
      items: [{ id: 'main', title: 'Toy Story', available: true }]
    },
    'kids/finding-nemo/content.json': {
      id: 'finding-nemo', title: 'Finding Nemo', profile: 'kids', available: true,
      items: [{ id: 'main', title: 'Finding Nemo', available: true }]
    },
    'adults/dark-knight/content.json': {
      id: 'dark-knight', title: 'The Dark Knight', profile: 'adults', available: true,
      items: [{ id: 'main', title: 'The Dark Knight', available: true }]
    }
  }
};
