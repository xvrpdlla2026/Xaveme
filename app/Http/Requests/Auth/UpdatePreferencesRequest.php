<?php

namespace App\Http\Requests\Auth;

use App\Http\Requests\ApiRequest;
use Illuminate\Validation\Rule;

class UpdatePreferencesRequest extends ApiRequest
{
    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'theme' => ['sometimes', 'nullable', 'string', Rule::in(['light', 'dark'])],
            'palette' => ['sometimes', 'nullable', 'string', Rule::in(['indigo', 'teal', 'amber', 'rose', 'violet', 'graphite'])],
        ];
    }
}