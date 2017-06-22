// Copyright IBM Corp. 2017. All Rights Reserved.
// Node module: @loopback/repository
// This file is licensed under the MIT License.
// License text available at https://opensource.org/licenses/MIT

import {Context, inject} from '@loopback/context';
import {repository} from '../../';

import {Repository} from '../../';
import {
  jugglerModule,
  bindModel,
  DataSourceConstructor,
  juggler,
  Entity,
  EntityCrudRepository,
  DefaultCrudRepository,
} from '../../';

class NoteController {
  constructor(
    @repository('noteRepo')
    public noteRepo: EntityCrudRepository<Entity, number>,
  ) {}
}

const ds: juggler.DataSource = new DataSourceConstructor({
    name: 'db',
    connector: 'memory',
  });

/* tslint:disable-next-line:variable-name */
const Note = ds.createModel<typeof juggler.PersistedModel>(
  'note',
  {title: 'string', content: 'string'},
  {},
);

class MyNoteRepository extends DefaultCrudRepository<Entity, string> {
  constructor(
    @inject('models.Note') myModel: typeof juggler.PersistedModel,
    // FIXME For some reason ts-node fails by complaining that
    // juggler is undefined if the following is used:
    // @inject('dataSources.memory') dataSource: juggler.DataSource
    // tslint:disable-next-line:no-any
    @inject('dataSources.memory') dataSource: any) {
      super(myModel, dataSource);
    }
}

async function main() {
  // Create a context
  const ctx = new Context();

  // Mock up a predefined repository
  const repo = new DefaultCrudRepository(Note, ds);

  // Bind the repository instance
  ctx.bind('repositories.noteRepo').to(repo);

  // Bind the controller class
  ctx.bind('controllers.MyController').toClass(NoteController);

  // Resolve the controller
  const controller: NoteController = await ctx.get('controllers.MyController');

  // Create a new note
  await controller.noteRepo.create({title: 't1', content: 'Note 1'});
  // Find all notes
  const notes = await controller.noteRepo.find();
  console.log('Notes', notes);
}

main();

