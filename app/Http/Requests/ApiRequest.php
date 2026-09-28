<?php

namespace App\Http\Requests;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Foundation\Http\FormRequest;

abstract class ApiRequest extends FormRequest
{
    /**
     * Form requests run before route model binding substitutes the path
     * parameters, so the raw value may still be a ULID string. Resolve it
     * once, here, and every caller gets a model or null.
     *
     * @template TModel of Model
     * @param  class-string<TModel>  $model
     * @return TModel|null
     */
    protected function routeModel(string $parameter, string $model): ?Model
    {
        $value = $this->route($parameter);

        if ($value instanceof $model) {
            return $value;
        }

        if (is_string($value) && $value !== '') {
            return $model::query()->find($value);
        }

        return null;
    }

    protected function workspaceFromRoute(): ?\App\Models\Workspace
    {
        return $this->routeModel('workspace', \App\Models\Workspace::class);
    }

    protected function ownsWorkspace(?\App\Models\Workspace $workspace): bool
    {
        return $workspace !== null
            && $this->user() !== null
            && $this->user()->getKey() === $workspace->user_id;
    }
}
