<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\Vault\StoreVaultRequest;
use App\Http\Resources\VaultResource;
use App\Models\Vault;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class VaultController extends Controller
{
    public function show(Request $request): JsonResponse
    {
        $this->authorize('view', Vault::class);

        $vault = Vault::where('user_id', $request->user()->getKey())->first();

        if ($vault === null) {
            return response()->json([
                'data' => [
                    'salt' => null,
                    'iterations' => null,
                    'check_iv' => null,
                    'check_ct' => null,
                    'configured' => false,
                ],
            ]);
        }

        return (new VaultResource($vault))->response();
    }

    public function store(StoreVaultRequest $request): JsonResponse
    {
        $this->authorize('create', Vault::class);

        // The owning relationship supplies user_id, so it cannot come from input.
        $vault = $request->user()->vault()->updateOrCreate(
            [],
            [
                'salt' => $request->string('salt')->toString(),
                'iterations' => (int) $request->input('iterations'),
                'check_iv' => $request->string('check_iv')->toString(),
                'check_ct' => $request->string('check_ct')->toString(),
            ]
        );

        // Pin the status: updateOrCreate marks a fresh row as recently created.
        return (new VaultResource($vault))->response()->setStatusCode(200);
    }

    public function destroy(Request $request): JsonResponse
    {
        $this->authorize('delete', Vault::class);

        Vault::where('user_id', $request->user()->getKey())->delete();

        return response()->json(['message' => 'Vault removed.']);
    }
}
