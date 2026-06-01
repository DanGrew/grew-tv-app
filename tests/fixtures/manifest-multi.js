module.exports = {
  manifest: {
    contentBase: 'http://localhost:8080/media/',
    content: [
      {
        id: 'single-film', title: 'Single Film', profile: 'kids',
        items: [{ id: 'single-main', label: 'Single Film' }]
      },
      {
        id: 'test-series', title: 'Test Series', profile: 'kids',
        items: [
          { id: 'ep1', label: 'Episode 1' },
          { id: 'ep2', label: 'Episode 2' },
          { id: 'ep3', label: 'Episode 3' }
        ]
      }
    ]
  }
};
