/** Fixture: a plugin naming a dimension none of its adapters covers. */
export default {
  name: 'acme-uncovered',
  verticals: [
    {
      id: 'acme-uncovered',
      description: 'Declares a dimension nothing covers.',
      dimensions: ['greeting', 'boostrap'],
      adapters: [
        {
          id: 'acme-uncovered/file',
          vertical: 'acme-uncovered',
          covers: ['greeting'],
          predicate: {},
          contribute: () => ({}),
        },
      ],
    },
  ],
};
