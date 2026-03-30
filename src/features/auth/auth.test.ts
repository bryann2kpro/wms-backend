import { beforeEach, describe, expect, test, vi } from "vitest";
import { AuthRepositoryClass } from "./auth.repository";
import type { UserType } from "./auth.model";

vi.mock("@/db/index", () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    transaction: vi.fn(),
  },
}));

vi.mock("@/util/logger.js", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

import { db } from "@/db/index";

const dbMock = db as unknown as {
  select: ReturnType<typeof vi.fn>;
  insert: ReturnType<typeof vi.fn>;
  transaction: ReturnType<typeof vi.fn>;
};

describe("AuthRepositoryClass", () => {
  let repository: AuthRepositoryClass;
  let jwtController: { verifyToken: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.clearAllMocks();
    jwtController = {
      verifyToken: vi.fn(),
    };
    repository = new AuthRepositoryClass(jwtController as never);
  });

  test("getUserByEmail returns first user when found", async () => {
    const fakeUser = {
      id: "user-1",
      email: "admin@smee.com.my",
      displayName: "Admin",
      passwordHash: "hashed",
      contactNo: null,
      isActive: true,
      primaryOrganizationId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      createdBy: "system",
      updatedBy: "system",
    } satisfies UserType;

    const limit = vi.fn().mockResolvedValue([fakeUser]);
    const where = vi.fn().mockReturnValue({ limit });
    const from = vi.fn().mockReturnValue({ where });
    dbMock.select.mockReturnValue({ from });

    const result = await repository.getUserByEmail("admin@smee.com.my");

    expect(result).toEqual(fakeUser);
    expect(dbMock.select).toHaveBeenCalledOnce();
    expect(from).toHaveBeenCalledOnce();
    expect(where).toHaveBeenCalledOnce();
    expect(limit).toHaveBeenCalledWith(1);
  });

  test("getUserByEmail returns null when not found", async () => {
    const limit = vi.fn().mockResolvedValue([]);
    const where = vi.fn().mockReturnValue({ limit });
    const from = vi.fn().mockReturnValue({ where });
    dbMock.select.mockReturnValue({ from });

    const result = await repository.getUserByEmail("missing@smee.com.my");

    expect(result).toBeNull();
  });

  test("createUser inserts and returns created user", async () => {
    const fakeUser = {
      id: "user-2",
      email: "new@smee.com.my",
      displayName: "New User",
      passwordHash: "hashed",
      contactNo: null,
      isActive: true,
      primaryOrganizationId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      createdBy: "system",
      updatedBy: "system",
    } satisfies UserType;

    const returning = vi.fn().mockResolvedValue([fakeUser]);
    const values = vi.fn().mockReturnValue({ returning });
    dbMock.insert.mockReturnValue({ values });

    const result = await repository.createUser({
      email: "new@smee.com.my",
      displayName: "New User",
      passwordHash: "hashed",
      contactNo: null,
      isActive: true,
      createdBy: "system",
      updatedBy: "system",
      primaryOrganizationId: null,
    });

    expect(result).toEqual(fakeUser);
    expect(dbMock.insert).toHaveBeenCalledOnce();
    expect(values).toHaveBeenCalledOnce();
    expect(returning).toHaveBeenCalledOnce();
  });

  test("createUserWithRole creates user and assigns role in one transaction", async () => {
    const fakeUser = {
      id: "user-3",
      email: "tx@smee.com.my",
      displayName: "Tx User",
      passwordHash: "hashed",
      contactNo: null,
      isActive: true,
      primaryOrganizationId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      createdBy: "system",
      updatedBy: "system",
    } satisfies UserType;

    dbMock.transaction.mockImplementation(async (callback: (tx: object) => Promise<unknown>) => callback({}));

    const createUserSpy = vi.spyOn(repository, "createUser").mockResolvedValue(fakeUser);
    const assignRoleSpy = vi.spyOn(repository, "assignRoleToUser").mockResolvedValue({
      id: "user-role-1",
      userId: fakeUser.id,
      roleId: "role-1",
      status: "active",
      createdAt: new Date(),
      updatedAt: new Date(),
      createdBy: "system",
      updatedBy: "system",
    });

    const result = await repository.createUserWithRole(
      {
        email: "tx@smee.com.my",
        displayName: "Tx User",
        passwordHash: "hashed",
        contactNo: null,
        isActive: true,
        createdBy: "system",
        updatedBy: "system",
        primaryOrganizationId: null,
      },
      "role-1",
    );

    expect(result).toEqual(fakeUser);
    expect(dbMock.transaction).toHaveBeenCalledOnce();
    expect(createUserSpy).toHaveBeenCalledOnce();
    expect(assignRoleSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-3",
        roleId: "role-1",
        status: "active",
      }),
      expect.any(Object),
    );
  });

  test("getUserDataByToken returns null when token has no username", async () => {
    jwtController.verifyToken.mockResolvedValue({});

    const result = await repository.getUserDataByToken("fake-token");

    expect(result).toBeNull();
    expect(jwtController.verifyToken).toHaveBeenCalledWith("fake-token");
  });

  test("getUsersByIds returns empty array for empty input", async () => {
    const result = await repository.getUsersByIds([]);

    expect(result).toEqual([]);
    expect(dbMock.select).not.toHaveBeenCalled();
  });
});