<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\Auth\UpdatePreferencesRequest;
use App\Http\Resources\UserResource;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class PreferencesController extends Controller
{
    public function show(Request $request): JsonResponse
    {
        return response()->json([
            'data' => [
                'preferences' => $request->user()->preferences ?? [],
            ],
        ]);
    }

    public function update(UpdatePreferencesRequest $request): JsonResponse
    {
        $user = $request->user();
        $preferences = $user->preferences ?? [];

        foreach (['theme', 'palette'] as $key) {
            if (! $request->has($key)) {
                continue;
            }

            $value = $request->input($key);

            if ($value === null) {
                unset($preferences[$key]);
            } else {
                $preferences[$key] = $value;
            }
        }

        $user->preferences = $preferences;
        $user->save();

        return (new UserResource($user))->response();
    }
}
