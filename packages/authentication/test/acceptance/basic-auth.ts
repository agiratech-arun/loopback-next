// Copyright IBM Corp. 2013,2017. All Rights Reserved.
// Node module: loopback
// This file is licensed under the MIT License.
// License text available at https://opensource.org/licenses/MIT

import {
  Application,
  Server,
  api,
  OpenApiSpec,
  ParameterObject,
  ServerRequest,
  ServerResponse,
  parseOperationArgs,
  writeResultToResponse,
  ParsedRequest,
  OperationArgs,
  FindRoute,
  InvokeMethod,
  getFromContext,
  bindElement,
  HttpErrors,
} from '@loopback/core';
import {expect, Client, createClientForServer} from '@loopback/testlab';
import {givenOpenApiSpec} from '@loopback/openapi-spec-builder';
import {inject, Provider, ValueOrPromise} from '@loopback/context';
import {authenticate,
  UserProfile,
  BindingKeys,
  AuthenticateFn,
  AuthenticationProvider,
  AuthenticationMetadata,
  AuthMetadataProvider,
} from '../..';
import {Strategy} from 'passport';
import {HttpError} from 'http-errors';

const BasicStrategy = require('passport-http').BasicStrategy;

describe('Basic Authentication', () => {
  let app: Application;
  let users: UserRepository;

  beforeEach(givenUserRespository);
  beforeEach(givenAnApplication);
  beforeEach(givenControllerInApp);
  beforeEach(givenAuthenticatedSequence);
  beforeEach(givenProviders);

  it ('authenticates successfully for correct credentials', () => {
    return whenIMakeRequestTo(app).then(client => {
      const credential =
        users.list.joe.profile.id + ':' + users.list.joe.password;
      const hash = new Buffer(credential).toString('base64');
      return client.get('/whoAmI')
        .set('Authorization', 'Basic ' + hash)
        .expect(users.list.joe.profile.id);
    });
  });

  it('returns error for invalid credentials', () => {
    return whenIMakeRequestTo(app).then(client => {
      const credential =
        users.list.Simpson.profile.id + ':' + 'invalid';
      const hash = new Buffer(credential).toString('base64');
      return client.get('/whoAmI')
        .set('Authorization', 'Basic ' + hash)
        .expect(401);
    });
  });

  function givenUserRespository() {
    users = new UserRepository({
      joe : {profile: {id: 'joe'}, password: '12345'},
      Simpson: {profile: {id: 'sim123'}, password: 'alpha'},
      Flintstone: {profile: {id: 'Flint'}, password: 'beta'},
      George: {profile: {id: 'Curious'}, password: 'gamma'},
    });
  }

  function givenAnApplication() {
    app = new Application();
    app.bind('application.name').to('SequenceApp');
  }

  function givenControllerInApp() {
    const apispec = givenOpenApiSpec()
      .withOperation('get', '/whoAmI', {
        'x-operation-name': 'whoAmI',
        responses: {
          '200': {
            type: 'string',
          },
        },
      })
      .build();

    @api(apispec)
    class MyController {
      constructor(@inject('authentication.user') private user: UserProfile) {}

      @authenticate('BasicStrategy')
      async whoAmI() : Promise<string> {
        return this.user.id;
      }
    }
    app.controller(MyController);
  }

  function givenAuthenticatedSequence() {
    class MySequence {
      constructor(
        @inject('findRoute') protected findRoute: FindRoute,
        @inject('getFromContext') protected getFromContext: getFromContext,
        @inject('invokeMethod') protected invoke: InvokeMethod,
        @inject('bindElement') protected bindElement: bindElement,
      ) {}

      async run(req: ParsedRequest, res: ServerResponse) {
        try {
          const {
            controller,
            methodName,
            spec: routeSpec,
            pathParams,
          } = this.findRoute(req);

          // Resolve authenticate() from AuthenticationProvider
          const authenticate: AuthenticateFn =
            await this.getFromContext(BindingKeys.Authentication.PROVIDER);

          // Authenticate
          const user: UserProfile = await authenticate(req);

          // User is expected to be returned or an exception should be thrown
          if (user) this.bindElement('authentication.user', user);
          else throw new HttpErrors.InternalServerError('auth error');

          // Authentication successful, proceed to invoke controller
          const args = await parseOperationArgs(req, routeSpec, pathParams);
          const result = await this.invoke(controller, methodName, args);
          writeResultToResponse(res, result);
        } catch (err) {
          this.sendError(res, req, err);
          return;
        }
      }
      sendError(res: ServerResponse, req: ServerRequest, err: HttpError) {
        const statusCode = err.statusCode || err.status || 500;
        res.statusCode = statusCode;
        res.end(err.message);
      }
    }
    // bind user defined sequence
    app.bind('sequence').toClass(MySequence);
  }

  function givenProviders() {
    class MyPassportStrategyProvider implements Provider<Strategy> {
      constructor(
        @inject(BindingKeys.Authentication.METADATA)
        private metadata: AuthenticationMetadata,
      ) {}
      async value() : Promise<Strategy> {
        if (this.metadata.strategy === 'BasicStrategy') {
          return new BasicStrategy(this.verify);
        } else {
          return Promise.reject('configured strategy is not available');
        }
      }
      // callback method for BasicStrategy
      verify(username: string, password: string, cb: Function) {
        process.nextTick(() => {
          users.find(username, password, cb);
        });
      }
    }
    app.bind(BindingKeys.Authentication.METADATA)
      .toProvider(AuthMetadataProvider);
    app.bind(BindingKeys.Authentication.STRATEGY)
      .toProvider(MyPassportStrategyProvider);
    app.bind(BindingKeys.Authentication.PROVIDER)
      .toProvider(AuthenticationProvider);
  }

  function whenIMakeRequestTo(application: Application): Promise<Client> {
    const server = new Server(application, {port: 0});
    return createClientForServer(server);
  }
});

class UserRepository {
  constructor(
    readonly list: {[key: string] : {profile: UserProfile, password: string}},
  ) {}
  find(username: string, password: string, cb: Function): void {
    const userList = this.list;
    function search(key: string) {
      return userList[key].profile.id === username;
    }
    const key = Object.keys(userList).find(search);
    if (!key) return cb(null, false);
    if (userList[key].password !== password) return cb(null, false);
    cb(null, userList[key].profile);
  }
}
