import { SwaggerProtect } from '@femike/swagger-protect'
import { HttpServer, INestApplication, ValidationPipe } from '@nestjs/common'
import type { NestFastifyApplication } from '@nestjs/platform-fastify'
import { Test, TestingModule } from '@nestjs/testing'
import { useContainer } from 'class-validator'
import * as request from 'supertest'
import { v4 as uuid } from 'uuid'
import { CatsModule } from '../src/cats/cats.module'
import { fastifyAdapter } from '../src/fastify'
import { createSwagger } from '../src/swagger'
import { SwaggerGuardMock } from './mocks/guard'
import { SwaggerLoginMock } from './mocks/login'

describe.each([
  {
    cookieKey: 'swagger_key',
    loginPath: '/login-me',
    swaggerPath: /^\/api\/(json|static\/index.html)(?:\/)?$/,
  },
])('forRoot() Simple (e2e)', settings => {
  let app: INestApplication
  let server: HttpServer
  const token = uuid()

  const guardMock = new SwaggerGuardMock()
  const loginMock = new SwaggerLoginMock()

  jest
    .spyOn(guardMock, 'canActivate')
    .mockImplementation(async (_token: string) => _token === token)

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        CatsModule,
        SwaggerProtect.forRoot({
          guard: guardMock,
          logIn: loginMock,
          cookieKey: settings.cookieKey,
          loginPath: settings.loginPath,
          swaggerPath: settings.swaggerPath,
          useUI: true,
        }),
      ],
    }).compile()

    app = moduleFixture.createNestApplication<NestFastifyApplication>(
      fastifyAdapter,
      {
        cors: false,
        logger: ['error'],
      },
    )
    app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        disableErrorMessages: false,
        enableDebugMessages: true,
      }),
    )
    useContainer(moduleFixture, { fallbackOnErrors: true })
    app.useLogger(['error'])
    app = createSwagger(app)
    await app.init()
    await app.getHttpAdapter().getInstance().ready()
    server = app.getHttpServer()
  })

  afterAll(async () => await app.close(), 30000)

  it('(GET) /api -', () => {
    return request(server)
      .get('/api')
      .expect(302)
      .then(res => {
        expect(res.header.location).toBe('./api/static/index.html')
      })
  })

  it('(GET) /api/static/index.html -', () => {
    return request(server)
      .get('/api/static/index.html')
      .expect(302)
      .then(res => {
        expect(res.header.location).toBe(
          settings.loginPath + '?backUrl=/api/static/index.html',
        )
      })
  })

  it('(GET) /api/json -', () => {
    return request(server)
      .get('/api/json')
      .expect(302)
      .then(res => {
        expect(res.header.location).toBe(
          settings.loginPath + '?backUrl=/api/json',
        )
      })
  })

  it('(GET) /api/static/index.html - with Cookie and unregistered token', () => {
    return request(server)
      .get('/api/static/index.html')
      .set({
        Cookie: `${settings.cookieKey}=${uuid()}`,
      })
      .expect(302)
      .then(res => {
        expect(res.header.location).toBe(
          '/login-me?backUrl=/api/static/index.html',
        )
      })
  })

  it('(GET) /api/json - with Cookie and unregistered token', () => {
    return request(server)
      .get('/api/json')
      .set({
        Cookie: `${settings.cookieKey}=${uuid()}`,
      })
      .expect(302)
      .then(res => {
        expect(res.header.location).toBe('/login-me?backUrl=/api/json')
      })
  })

  it('(GET) /api/static/index.html - with Cookie', () => {
    return request(server)
      .get('/api/static/index.html')
      .set({
        Cookie: `${settings.cookieKey}=${token}`,
      })
      .expect(200)
      .then(res => {
        expect(res.text).toContain('const ui = SwaggerUIBundle(config)')
      })
  })

  it('(GET) /api/json - with Cookie', () => {
    return request(server)
      .get('/api/json')
      .set({
        Cookie: `${settings.cookieKey}=${token}`,
      })
      .expect(200)
      .then(res => {
        expect(res.text).toContain('"openapi":"3.0.0"')
      })
  })

  it('(POST) /login-api - must be disabled 404', () => {
    return request(server).post('/login-api').expect(404)
  })

  it('(GET) /login-api - must be disabled 404', () => {
    return request(server).get('/login-api').expect(404)
  })

  it('(POST) /login-me - must dont answer', () => {
    return request(server).post(settings.loginPath).expect(404)
  })
  it('(GET) /login-me - must dont answer', () => {
    return request(server).get(settings.loginPath).expect(404)
  })
})
