module.exports = {
  manifest: {
    contentBase: 'http://localhost:8080/media/',
    content: [
      {
        id: 'toy-story', title: 'Toy Story', profile: 'kids',
        items: [{ id: 'toy-story-main', label: 'Toy Story' }]
      },
      {
        id: 'finding-nemo', title: 'Finding Nemo', profile: 'kids',
        items: [{ id: 'finding-nemo-main', label: 'Finding Nemo' }]
      },
      {
        id: 'dark-knight', title: 'The Dark Knight', profile: 'adults',
        items: [{ id: 'dark-knight-main', label: 'The Dark Knight' }]
      }
    ]
  }
};
