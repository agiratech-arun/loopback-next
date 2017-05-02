// Copyright IBM Corp. 2013,2017. All Rights Reserved.
// Node module: loopback
// This file is licensed under the MIT License.
// License text available at https://opensource.org/licenses/MIT
import * as http from 'http';
import {ServerRequest as Request} from 'http';

/**
 * Interface definition of a passport strategy.
 */
export interface Strategy {
  authenticate(req: http.ServerRequest): void;
}

/**
 * Http Request interface
 */
export interface ParsedRequest extends Request {
  // see http://expressjs.com/en/4x/api.html#req.path
  path: string;
  // see http://expressjs.com/en/4x/api.html#req.query
  query: { [key: string]: string };
  // see https://github.com/DefinitelyTyped/DefinitelyTyped/issues/15808
  url: string;
  pathname: string;
  method: string;
}

/**
 * Shimmed Request to satisfy express requirements of passport strategies.
 */
export class ShimRequest {
  headers: Object;
  query: Object;
  url: string;
  path: string;
  method: string;
  constructor(request?: ParsedRequest) {
    if (request) {
      this.headers = request.headers;
      this.query = request.query;
      this.url = request.url;
      this.path = request.path;
      this.method = request.method;
    }
  }
}

/**
 * Adapter class to invoke a passport strategy.
 * Instance is created by passing a passport strategy in the constructor
 */
export class StrategyAdapter {
  private strategyCtor: Strategy;

  constructor(strategy: Strategy) {
    this.strategyCtor = strategy;
  }

  /**
   * The function to invoke the contained passport strategy.
   *     1. Create an instance of the strategy
   *     2. add success and failure state handlers
   *     3. authenticate using the strategy
   * @param req {http.ServerRequest} The incoming request.
   */
  authenticate(req: ParsedRequest) {
    const shimReq = new ShimRequest(req);
    return new Promise<Object>((resolve, reject) => {
      // create an instance of the strategy
      const strategy = Object.create(this.strategyCtor);
      const self = this;

      // add success state handler to strategy instance
      strategy.success = function(user: object) {
        resolve(user);
      };

      // add failure state handler to strategy instance
      strategy.fail = function(challenge: string) {
        reject(new Error(challenge));
      };

      // add error state handler to strategy instance
      strategy.error = function(error: string) {
        reject(new Error(error));
      };

      // authenticate
      strategy.authenticate(shimReq);
    });
  }
}